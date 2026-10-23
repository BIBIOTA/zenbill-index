#!/usr/bin/env python3
"""Helpers for importing a bank credit-card statement into credit_card_statements.

Subcommands (all print JSON):

    accounts  [--name KW] [--db DB]
        Active CREDIT accounts: id, name, currency, closing_day, payment_due_day.

    cycle     --closing-day N --statement-date YYYY-MM-DD
        The ZenBill cycle whose end is the latest one on or before the bank's
        statement date, plus gap_days and needs_confirmation (gap > 7 days).

    estimate  --account-id UUID --cycle-end YYYY-MM-DD [--db DB] [--print-sql]
        Read-only: cycle_net, carryover, estimated_amount_due, the stored
        statement for that cycle (if any) and diff = statement − estimate.
        Before the statements table exists, carryover is assumed 0 (warning).

    upsert    --account-id UUID --cycle-end YYYY-MM-DD --amount-due X
              [--minimum-due X] [--due-date D] [--statement-date D]
              [--previous-balance X] [--payments-credited X] [--new-charges X]
              [--note TEXT] [--db DB] [--rollback] [--print-sql]
        INSERT … ON CONFLICT (account_id, cycle_end) DO UPDATE, source='skill'.
        Targeting zenbill_prod first checks zenbill_api_prod's ZENBILL_DB_NAME.
        --rollback runs the write inside BEGIN … ROLLBACK (dry run).
        --print-sql prints the SQL and touches nothing.

    self-test
        Checks the cycle arithmetic against cases taken from the Go
        domain.BillingCycleAt.

Cycle rules mirror backend/internal/domain/billing_cycle.go: the cycle closing
in month (y, m) ends on time.Date(y, m, closingDay) and starts on
time.Date(y, m-1, closingDay+1), both normalized the Go way, so closing day 31
in a short month rolls over into the next month (Feb 31 2026 → Mar 3).
"""
import argparse
import json
import re
import subprocess
import sys
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation

CONTAINER = "zenbill_postgres"
DB_USER = "zenbill"
PROD_DB = "zenbill_prod"
PROD_API_CONTAINER = "zenbill_api_prod"
MAX_GAP_DAYS = 7
UUID_RE = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")


# ---------------------------------------------------------------- cycle math

def go_date(y: int, m: int, d: int) -> date:
    """time.Date(y, m, d) at midnight: month and day overflow normalize forward."""
    y += (m - 1) // 12
    m = (m - 1) % 12 + 1
    return date(y, m, 1) + timedelta(days=d - 1)


def cycle_closing_in(y: int, m: int, closing_day: int):
    """(start, end) of the cycle that closes in month (y, m)."""
    return go_date(y, m - 1, closing_day + 1), go_date(y, m, closing_day)


def billing_cycle_at(today: date, closing_day: int, offset: int):
    """Line-for-line port of domain.BillingCycleAt."""
    end_month = today.month + (1 if today.day > closing_day else 0) + offset
    first = go_date(today.year, end_month, 1)
    return cycle_closing_in(first.year, first.month, closing_day)


def _cycles_around(d: date, closing_day: int):
    # Ends are monotonic in (y, m); a rolled-over end is at most 3 days into
    # the next month, so these months cover every end within ±2 months of d.
    for k in range(-3, 3):
        yield cycle_closing_in(d.year, d.month + k, closing_day)


def cycle_on_or_before(d: date, closing_day: int):
    """The cycle with the latest end on or before d."""
    return max((c for c in _cycles_around(d, closing_day) if c[1] <= d), key=lambda c: c[1])


def previous_cycle(cycle_end: date, closing_day: int):
    return cycle_on_or_before(cycle_end - timedelta(days=1), closing_day)


def is_cycle_end(d: date, closing_day: int) -> bool:
    return any(end == d for _, end in _cycles_around(d, closing_day))


# ------------------------------------------------------------------- DB glue

def psql(db: str, sql: str) -> str:
    out = subprocess.run(
        ["docker", "exec", "-i", CONTAINER, "psql", "-U", DB_USER, "-d", db,
         "-v", "ON_ERROR_STOP=1", "-qtA", "-f", "-"],
        input=sql, capture_output=True, text=True,
    )
    if out.returncode != 0:
        sys.exit(f"psql error: {out.stderr.strip()}")
    return out.stdout.strip()


def psql_json(db: str, sql: str):
    text = psql(db, sql)
    # parse_float keeps numeric(19,4) exact; json_agg output spans several lines.
    return json.loads(text, parse_float=Decimal) if text else None


def verify_prod_db_name():
    """Abort unless the prod API container really reads zenbill_prod."""
    out = subprocess.run(
        ["docker", "inspect", PROD_API_CONTAINER, "--format",
         "{{range .Config.Env}}{{println .}}{{end}}"],
        capture_output=True, text=True,
    )
    names = [l.split("=", 1)[1] for l in out.stdout.splitlines() if l.startswith("ZENBILL_DB_NAME=")]
    if out.returncode != 0 or names != [PROD_DB]:
        sys.exit(f"DB_NAME check failed: {PROD_API_CONTAINER} has ZENBILL_DB_NAME={names or '?'} "
                 f"(expected {PROD_DB}). Stop and ask the user which DB the app reads.")


def table_exists(db: str) -> bool:
    return psql(db, "SELECT to_regclass('public.credit_card_statements') IS NOT NULL;") == "t"


def load_account(db: str, account_id: str):
    acct = psql_json(db, (
        "SELECT row_to_json(a) FROM (SELECT id, user_id, name, type, currency, closing_day, "
        f"payment_due_day FROM accounts WHERE id = '{account_id}') a;"))
    if not acct:
        sys.exit(f"account {account_id} not found in {db}")
    if acct["type"] != "CREDIT" or acct["closing_day"] is None:
        sys.exit(f"account {acct['name']} is {acct['type']} with closing_day={acct['closing_day']}; "
                 "statements need a CREDIT account with a closing day")
    return acct


# ------------------------------------------------------------- arg checking

def arg_uuid(s: str) -> str:
    if not UUID_RE.match(s):
        raise argparse.ArgumentTypeError(f"not a UUID: {s}")
    return s.lower()


def arg_date(s: str) -> date:
    try:
        return date.fromisoformat(s)
    except ValueError:
        raise argparse.ArgumentTypeError(f"not YYYY-MM-DD: {s}")


def arg_amount(s: str) -> Decimal:
    try:
        v = Decimal(s.replace(",", ""))
    except InvalidOperation:
        raise argparse.ArgumentTypeError(f"not a number: {s}")
    if not v.is_finite():
        raise argparse.ArgumentTypeError(f"not a number: {s}")
    return v


def sql_lit(v) -> str:
    if v is None:
        return "NULL"
    if isinstance(v, Decimal):
        return str(v)
    if isinstance(v, date):
        return f"DATE '{v.isoformat()}'"
    return "'" + str(v).replace("'", "''") + "'"


# --------------------------------------------------------------- subcommands

def cmd_accounts(args):
    where = "type = 'CREDIT' AND archived_at IS NULL"
    if args.name:
        where += " AND name ILIKE " + sql_lit(f"%{args.name}%")
    rows = psql_json(args.db, (
        "SELECT COALESCE(json_agg(a ORDER BY a.name), '[]') FROM (SELECT id, name, currency, "
        f"closing_day, payment_due_day FROM accounts WHERE {where}) a;"))
    print(json.dumps(rows, ensure_ascii=False, indent=1, default=str))


def cmd_cycle(args):
    start, end = cycle_on_or_before(args.statement_date, args.closing_day)
    gap = (args.statement_date - end).days
    print(json.dumps({
        "cycle_start": start.isoformat(), "cycle_end": end.isoformat(),
        "statement_date": args.statement_date.isoformat(), "gap_days": gap,
        "needs_confirmation": gap > MAX_GAP_DAYS,
    }, indent=1))


def estimate_sql(account_id: str, closing_day: int, cycle_end: date, have_table: bool = True) -> str:
    """One SELECT returning the estimate as JSON (spec 「計算：應繳總額」).

    cycle_net mirrors FindByAccountIDAndDateRangeWithDeferred + cycleNetAmountDue:
    the card's own rows, EXPENSE − INCOME − SETTLEMENT, TRANSFER ignored,
    deferred-out rows of this cycle excluded, deferred-in rows of the previous
    cycle included. prev_paid mirrors SumTransfersIntoAccount over the previous
    cycle's payment window (prev cycle_end + 1 day through this cycle_end).
    Carryover comes only from a stored previous statement, never recursively.
    occurred_at holds local wall-clock time, so "< end + 1 day" == "<= end 23:59:59.999…".
    """
    start, end = cycle_on_or_before(cycle_end, closing_day)
    prev_start, prev_end = previous_cycle(end, closing_day)
    aid = account_id
    stmt = (f"(SELECT row_to_json(s) FROM credit_card_statements s "
            f"WHERE s.account_id = '{aid}' AND s.cycle_end = {sql_lit(end)})") if have_table else "NULL::json"
    prev_due = (f"(SELECT amount_due FROM credit_card_statements "
                f"WHERE account_id = '{aid}' AND cycle_end = {sql_lit(prev_end)})") if have_table else "NULL::numeric"
    return f"""
WITH n AS (
  SELECT
    (SELECT COALESCE(SUM(CASE WHEN type = 'EXPENSE' THEN amount
                              WHEN type IN ('INCOME', 'SETTLEMENT') THEN -amount
                              ELSE 0 END), 0)
       FROM transactions
      WHERE account_id = '{aid}' AND (
        (occurred_at >= {sql_lit(start)} AND occurred_at < {sql_lit(end + timedelta(days=1))} AND NOT billing_period_deferred) OR
        (occurred_at >= {sql_lit(prev_start)} AND occurred_at < {sql_lit(prev_end + timedelta(days=1))} AND billing_period_deferred))
    ) AS cycle_net,
    {prev_due} AS prev_statement_amount_due,
    (SELECT COALESCE(SUM(COALESCE(original_amount, amount)), 0) FROM transactions
      WHERE type = 'TRANSFER' AND target_account_id = '{aid}'
        AND occurred_at >= {sql_lit(prev_end + timedelta(days=1))} AND occurred_at < {sql_lit(end + timedelta(days=1))}
    ) AS prev_paid,
    {stmt} AS statement
), c AS (
  SELECT n.*, COALESCE(prev_statement_amount_due - prev_paid, 0) AS carryover FROM n
), e AS (
  SELECT c.*, cycle_net + carryover AS estimated_amount_due FROM c
)
SELECT json_build_object(
  'cycle_start', {sql_lit(start)}, 'cycle_end', {sql_lit(end)}, 'prev_cycle_end', {sql_lit(prev_end)},
  'cycle_net', cycle_net, 'prev_statement_amount_due', prev_statement_amount_due,
  'prev_paid', prev_paid, 'carryover', carryover, 'estimated_amount_due', estimated_amount_due,
  'statement', statement,
  'diff', (statement->>'amount_due')::numeric - estimated_amount_due)
FROM e;"""


def cmd_estimate(args):
    acct = load_account(args.db, args.account_id)
    if not is_cycle_end(args.cycle_end, acct["closing_day"]):
        sys.exit(f"{args.cycle_end} is not a cycle end for closing_day={acct['closing_day']}")
    if args.print_sql:
        print(estimate_sql(acct["id"], acct["closing_day"], args.cycle_end))
        return
    have_table = table_exists(args.db)
    out = {"account_id": acct["id"], "name": acct["name"], "currency": acct["currency"]}
    out.update(psql_json(args.db, estimate_sql(acct["id"], acct["closing_day"], args.cycle_end, have_table)))
    if not have_table:
        out["warning"] = f"credit_card_statements does not exist in {args.db}; carryover assumed 0"
    print(json.dumps(out, ensure_ascii=False, indent=1, default=str))


OPTIONAL = ["minimum_due", "due_date", "statement_date", "previous_balance",
            "payments_credited", "new_charges", "note"]


def upsert_sql(account_id: str, cycle_end: date, amount_due: Decimal, opt: dict, rollback: bool) -> str:
    cols = ["amount_due"] + OPTIONAL
    vals = [sql_lit(amount_due)] + [sql_lit(opt.get(c)) for c in OPTIONAL]
    # amount_due always replaced; an optional field the statement did not show
    # keeps whatever was stored before (e.g. a manual minimum_due).
    sets = ["amount_due = EXCLUDED.amount_due"] + [
        f"{c} = COALESCE(EXCLUDED.{c}, credit_card_statements.{c})" for c in OPTIONAL]
    return f"""BEGIN;
WITH up AS (
  INSERT INTO credit_card_statements
    (id, user_id, account_id, cycle_end, {", ".join(cols)}, source, created_at, updated_at)
  SELECT gen_random_uuid(), a.user_id, a.id, {sql_lit(cycle_end)}, {", ".join(vals)}, 'skill', now(), now()
  FROM accounts a WHERE a.id = '{account_id}' AND a.type = 'CREDIT'
  ON CONFLICT (account_id, cycle_end) DO UPDATE SET
    {", ".join(sets)},
    source = 'skill', updated_at = now()
  RETURNING *
)
SELECT COALESCE(json_agg(up), '[]') FROM up;
{"ROLLBACK" if rollback else "COMMIT"};
"""


def cmd_upsert(args):
    opt = {c: getattr(args, c) for c in OPTIONAL}
    sql = upsert_sql(args.account_id, args.cycle_end, args.amount_due, opt, args.rollback)
    if args.print_sql:
        print(sql)
        return
    if args.db == PROD_DB:
        verify_prod_db_name()
    elif not args.rollback:
        print(f"WARNING: writing to {args.db}; the app reads {PROD_DB}", file=sys.stderr)
    if not table_exists(args.db):
        sys.exit(f"credit_card_statements does not exist in {args.db}; the backend migration is not applied yet")
    acct = load_account(args.db, args.account_id)
    if not is_cycle_end(args.cycle_end, acct["closing_day"]):
        sys.exit(f"{args.cycle_end} is not a cycle end for closing_day={acct['closing_day']}")
    rows = psql_json(args.db, sql)
    if not rows or len(rows) != 1:
        sys.exit(f"expected 1 upserted row, got {rows!r}")
    print(json.dumps({"db": args.db, "rolled_back": args.rollback, "row": rows[0]},
                     ensure_ascii=False, indent=1, default=str))


# ------------------------------------------------------------------ self-test

def cmd_self_test(_args):
    d = date.fromisoformat
    # Expected values produced by running domain.BillingCycleAt (Go).
    go_cases = [
        # today, closing_day, offset, start, end
        ("2026-10-23", 16, -1, "2026-09-17", "2026-10-16"),
        ("2026-10-16", 16, 0, "2026-09-17", "2026-10-16"),
        ("2026-10-17", 16, 0, "2026-10-17", "2026-11-16"),
        ("2026-01-05", 7, -1, "2025-11-08", "2025-12-07"),
        ("2026-02-15", 31, 0, "2026-02-01", "2026-03-03"),
        ("2026-03-15", 31, 0, "2026-03-04", "2026-03-31"),
        ("2026-03-02", 31, -1, "2026-02-01", "2026-03-03"),
        ("2028-02-10", 30, 0, "2028-01-31", "2028-03-01"),
        ("2026-12-20", 20, 1, "2026-12-21", "2027-01-20"),
    ]
    for today, cd, off, s, e in go_cases:
        got = billing_cycle_at(d(today), cd, off)
        assert got == (d(s), d(e)), (today, cd, off, got)

    # statement_date → cycle_end (latest end on or before it).
    lookup = [
        ("2026-10-18", 16, "2026-10-16", 2),   # 國泰cube: bank closes 18, ZenBill 16
        ("2026-10-16", 16, "2026-10-16", 0),   # same day counts
        ("2026-10-15", 16, "2026-09-16", 29),  # day before → previous cycle, needs confirmation
        ("2026-03-05", 31, "2026-03-03", 2),   # rolled-over Feb end
        ("2026-03-02", 31, "2026-01-31", 30),
        ("2027-01-03", 31, "2026-12-31", 3),   # year boundary
    ]
    for sd, cd, want, gap in lookup:
        start, end = cycle_on_or_before(d(sd), cd)
        assert end == d(want) and (d(sd) - end).days == gap, (sd, cd, end)

    # Exhaustive: for every closing day and date, the lookup is the latest end ≤ date,
    # cycles tile without gaps, and the set of ends equals what BillingCycleAt yields.
    day = date(2025, 11, 1)
    while day <= date(2028, 3, 31):
        for cd in range(1, 32):
            start, end = cycle_on_or_before(day, cd)
            assert end <= day and is_cycle_end(end, cd), (day, cd)
            nxt = [c for c in _cycles_around(day, cd) if c[1] > end]
            assert min(nxt, key=lambda c: c[1])[1] > day, (day, cd)  # latest, not just any
            assert previous_cycle(end, cd)[1] + timedelta(days=1) == start, (day, cd)
            # Every cycle BillingCycleAt yields is found by the lookup on its end.
            for off in (-2, -1, 0):
                bstart, bend = billing_cycle_at(day, cd, off)
                assert is_cycle_end(bend, cd) and cycle_on_or_before(bend, cd) == (bstart, bend), (day, cd, off)
        day += timedelta(days=1)

    # SQL shape sanity.
    sql = upsert_sql("00000000-0000-0000-0000-000000000001", d("2026-10-16"), Decimal("11750"),
                     {"note": "O'Brien", "due_date": d("2026-11-01")}, rollback=True)
    assert "'O''Brien'" in sql and sql.rstrip().endswith("ROLLBACK;") and "DATE '2026-11-01'" in sql
    print("self-test ok")


# ----------------------------------------------------------------------- main

def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    a = sub.add_parser("accounts")
    a.add_argument("--name")
    a.add_argument("--db", default=PROD_DB)
    a.set_defaults(func=cmd_accounts)

    c = sub.add_parser("cycle")
    c.add_argument("--closing-day", type=int, required=True, choices=range(1, 32), metavar="1..31")
    c.add_argument("--statement-date", type=arg_date, required=True)
    c.set_defaults(func=cmd_cycle)

    e = sub.add_parser("estimate")
    e.add_argument("--account-id", type=arg_uuid, required=True)
    e.add_argument("--cycle-end", type=arg_date, required=True)
    e.add_argument("--db", default=PROD_DB)
    e.add_argument("--print-sql", action="store_true")
    e.set_defaults(func=cmd_estimate)

    u = sub.add_parser("upsert")
    u.add_argument("--account-id", type=arg_uuid, required=True)
    u.add_argument("--cycle-end", type=arg_date, required=True)
    u.add_argument("--amount-due", type=arg_amount, required=True)
    for name in ("minimum-due", "previous-balance", "payments-credited", "new-charges"):
        u.add_argument(f"--{name}", type=arg_amount)
    u.add_argument("--due-date", type=arg_date)
    u.add_argument("--statement-date", type=arg_date)
    u.add_argument("--note")
    u.add_argument("--db", default=PROD_DB)
    u.add_argument("--rollback", action="store_true")
    u.add_argument("--print-sql", action="store_true")
    u.set_defaults(func=cmd_upsert)

    t = sub.add_parser("self-test")
    t.set_defaults(func=cmd_self_test)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
