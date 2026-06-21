#!/usr/bin/env python3
"""List a ZenBill credit-card account's transactions for a billing period.

Reads straight from the ZenBill Postgres container (no JWT needed) so the
statement reconciliation step has a clean, structured list to diff against.

Usage:
    reconcile.py --card 幣倍 --start 2026-05-01 --end 2026-05-31
    reconcile.py --account-id <uuid> --start 2026-05-01 --end 2026-05-31

Only EXPENSE rows are returned by default (statement line items); pass
--include-transfers to also see auto-pay/settlement rows.
"""
import argparse
import json
import subprocess
import sys

CONTAINER = "zenbill_postgres"
DB_USER = "zenbill"
DB_NAME = "zenbill_prod"


def psql_json(sql: str):
    """Run SQL in the container and return parsed JSON rows."""
    wrapped = f"SELECT COALESCE(json_agg(t), '[]') FROM ({sql}) t;"
    out = subprocess.run(
        ["docker", "exec", CONTAINER, "psql", "-U", DB_USER, "-d", DB_NAME,
         "-tAc", wrapped],
        capture_output=True, text=True,
    )
    if out.returncode != 0:
        sys.exit(f"psql error: {out.stderr.strip()}")
    return json.loads(out.stdout.strip() or "[]")


def find_account(card: str):
    rows = psql_json(
        "SELECT a.id, a.name, b.name AS bank, a.payment_due_day "
        "FROM accounts a LEFT JOIN banks b ON a.bank_id=b.id "
        f"WHERE a.type='CREDIT' AND a.name ILIKE '%{card}%'"
    )
    if not rows:
        sys.exit(f"No CREDIT account matches '{card}'. Try a different keyword.")
    if len(rows) > 1:
        print("Multiple cards match — narrow the keyword:", file=sys.stderr)
        for r in rows:
            print(f"  {r['id']}  {r['name']} ({r['bank']})", file=sys.stderr)
        sys.exit(1)
    return rows[0]


def main():
    p = argparse.ArgumentParser()
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--card", help="card name keyword (ILIKE)")
    g.add_argument("--account-id", help="exact account UUID")
    p.add_argument("--start", required=True, help="period start YYYY-MM-DD (inclusive)")
    p.add_argument("--end", required=True, help="period end YYYY-MM-DD (inclusive)")
    p.add_argument("--include-transfers", action="store_true",
                   help="also include TRANSFER/SETTLEMENT (auto-pay) rows")
    args = p.parse_args()

    if args.card:
        acct = find_account(args.card)
        account_id = acct["id"]
        print(f"# {acct['name']} ({acct['bank']})  due day {acct['payment_due_day']}")
        print(f"# account_id={account_id}\n")
    else:
        account_id = args.account_id

    type_filter = "" if args.include_transfers else "AND t.type='EXPENSE'"
    rows = psql_json(
        "SELECT t.occurred_at::date AS date, t.amount, t.type, "
        "COALESCE(m.name, NULLIF(t.note,''), '(no payee)') AS payee "
        "FROM transactions t LEFT JOIN merchants m ON t.merchant_id=m.id "
        f"WHERE t.account_id='{account_id}' "
        f"AND t.occurred_at >= '{args.start}' "
        f"AND t.occurred_at < ('{args.end}'::date + 1) "
        f"{type_filter} "
        "ORDER BY t.occurred_at"
    )

    total = 0.0
    for r in rows:
        amt = float(r["amount"])
        total += amt
        print(f"{r['date']}  {amt:>12,.2f}  {r['type']:<10} {r['payee']}")
    print(f"\n{len(rows)} rows, EXPENSE total = {total:,.2f}")


if __name__ == "__main__":
    main()
