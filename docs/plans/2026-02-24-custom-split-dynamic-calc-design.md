# Custom Split Dynamic Calculation Design

## Summary

Enhance the shared ledger "Custom Amount" split method with smart defaults and real-time linked calculation between the two share fields.

## Current Behavior

When selecting "自訂金額" (CUSTOM), both share inputs start empty with placeholder "0". Users must manually enter both values.

## New Behavior

### 1. Default Values on CUSTOM Selection

When switching split method to CUSTOM:
- `ownerAmount` = `Math.floor(totalAmount / 2 * 100) / 100`
- `partnerAmount` = `totalAmount - ownerAmount`

This ensures the sum always equals totalAmount exactly (no floating point drift).

### 2. Linked Calculation

When either field changes:
- Edit ownerAmount → `partnerAmount = totalAmount - clamp(ownerAmount, 0, totalAmount)`
- Edit partnerAmount → `ownerAmount = totalAmount - clamp(partnerAmount, 0, totalAmount)`

### 3. Clamping

- Input > totalAmount → clamp to totalAmount, other party becomes 0
- Input < 0 → clamp to 0, other party becomes totalAmount
- Non-numeric input → treated as 0

### 4. Total Amount Changes

When totalAmount changes while in CUSTOM mode:
- Recalculate proportionally: `newOwner = round(newTotal * (ownerAmount / oldTotal))`
- `newPartner = newTotal - newOwner`
- If oldTotal is 0, fall back to equal split

## Scope

- **File changed:** `frontend/src/pages/SharedExpenseFormPage.tsx` only
- **No backend changes**
- **No new files**

## Approach

Pure frontend: method A (inline state logic in the existing component).
