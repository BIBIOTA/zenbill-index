# Partner Receivable Account Design

**Date:** 2026-02-25
**Status:** Approved

## Problem

When a partner accepts an invite and joins a shared ledger, no RECEIVABLE account is created for them. The owner gets a receivable account at ledger creation time, but the partner has no corresponding account in their personal account list. This means the partner cannot see the receivable relationship on their AccountsPage or Dashboard.

## Solution

Add a `partner_receivable_account_id` field to `shared_ledgers`. Create a mirror RECEIVABLE account for the partner when they accept the invite. Keep both accounts in sync (opposite signs) on every shared expense operation.

## Design

### Schema Change

Add to `shared_ledgers` table:

```
partner_receivable_account_id  UUID  nullable  FK → accounts.id
```

Nullable because it is NULL until a partner accepts the invite.

### Domain Entity

```go
// SharedLedger - new fields
PartnerReceivableAccountID *uuid.UUID `gorm:"type:uuid" json:"partner_receivable_account_id"`
PartnerReceivableAccount   *Account   `gorm:"foreignKey:PartnerReceivableAccountID" json:"partner_receivable_account,omitempty"`
```

### AcceptInvite Flow

When partner accepts invite:

1. Create RECEIVABLE account: name=`應收帳款 - {ledger.Name}`, user_id=partnerUserID, currency=ledger.Currency
2. Set initial balance = -(owner receivable account balance) to mirror existing state
3. Set `ledger.PartnerReceivableAccountID = newAccount.ID`
4. Set `ledger.PartnerID = &partnerUserID`
5. Save ledger

### SharedExpense Sync Rules

All operations that modify the owner's receivable account balance must also modify the partner's receivable account balance with the opposite sign. The partner account update is skipped if `PartnerReceivableAccountID` is nil (partner hasn't joined yet).

**Create:** After `UpdateBalance(ownerReceivableID, +delta)`, also `UpdateBalance(partnerReceivableID, -delta)`

**Delete:** After reversing owner balance, also reverse partner balance (opposite direction)

**Settle:** After settling owner receivable, also settle partner receivable (opposite direction)

**SettleAll:** Same as Settle but for each expense in the batch.

### SQL Migration

For existing ledgers where `partner_id IS NOT NULL AND partner_receivable_account_id IS NULL`:

1. Create a RECEIVABLE account for each partner
2. Set balance = -(owner receivable account balance)
3. Update `partner_receivable_account_id`

### Frontend Impact

None. The AccountsPage already lists all RECEIVABLE accounts automatically. The partner's new account will appear in their account list and Dashboard receivable total without code changes.
