import { getCollection, setCollection, enqueueSync } from '../lib/localStore'
import { listCashMovements } from './accountingService'
import { supabase } from '../lib/supabase'
import { canDo, parseError } from '../types/app'
import type { UserContext } from '../types/app'
import type { CashMovement } from '../types/accounting'
import type {
  BankAccount,
  BankAccountInput,
  BankReconciliationDashboardKpis,
  BankStatementLine,
  BankStatementLineInput,
} from '../types/bankReconciliation'

const STATEMENT_LINES_KEY = 'bank-recon:statement-lines'

// ---------------------------------------------------------------------------
// Bank Accounts are real: imagecare.bank_accounts (database/migrations/
// 0009_stage2_financial.sql) has RLS and full CRUD support - this used to be
// local-only (IndexedDB) purely because nothing wired it up. Statement lines
// below stay local: there is no imagecare.bank_statement_lines table.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRealBankAccount(row: any): BankAccount {
  return {
    id: row.id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_by: row.created_by ?? '',
    updated_by: row.updated_by ?? '',
    branch_id: row.branch_id ?? null,
    is_active: row.is_active,
    sync_status: 'synced',
    last_synced_at: null,
    name: row.account_name,
    accountNumber: row.account_number,
    openingBalanceUgx: Number(row.opening_balance ?? 0),
  }
}

export class AmountMismatchError extends Error {
  constructor() {
    super('The statement line amount does not match the deposit amount.')
    this.name = 'AmountMismatchError'
  }
}
export class AlreadyMatchedError extends Error {
  constructor() {
    super('One of these is already matched to something else.')
    this.name = 'AlreadyMatchedError'
  }
}
export class AccountInUseError extends Error {
  constructor() {
    super('This account has statement lines recorded against it and cannot be archived.')
    this.name = 'AccountInUseError'
  }
}

// ---------- Bank Accounts (real) ----------

export async function listBankAccounts(ctx: UserContext): Promise<BankAccount[]> {
  const { data, error } = await supabase
    .schema('imagecare')
    .from('bank_accounts')
    .select('*')
    .eq('business_id', ctx.business_id)
    .is('deleted_at', null)
    .order('account_name', { ascending: true })
  if (error) throw new Error(parseError(error).message)
  return (data ?? []).map(mapRealBankAccount)
}

export async function createBankAccount(ctx: UserContext, input: BankAccountInput, userId: string): Promise<BankAccount> {
  if (!input.name.trim()) throw new Error('Account name is required.')
  if (!canDo(ctx, 'cash', 'create')) throw new Error('You do not have permission to create bank accounts.')

  // The form only collects one "name" field (see BankAccountFormModal), so
  // it doubles as both bank_name and account_name - both are NOT NULL on
  // the real table and there is no second field in the UI to source a
  // distinct bank name from.
  const { data, error } = await supabase
    .schema('imagecare')
    .from('bank_accounts')
    .insert({
      business_id: ctx.business_id,
      branch_id: ctx.branch_id ?? null,
      bank_name: input.name,
      account_name: input.name,
      account_number: input.accountNumber,
      opening_balance: input.openingBalanceUgx,
      current_balance: input.openingBalanceUgx,
      is_active: true,
      created_by: userId,
      updated_by: userId,
    })
    .select()
    .single()
  if (error) throw new Error(parseError(error).message)
  return mapRealBankAccount(data)
}

export async function archiveBankAccount(ctx: UserContext, id: string, userId: string): Promise<void> {
  const lines = await listStatementLines(id)
  if (lines.length > 0) throw new AccountInUseError()
  if (!canDo(ctx, 'cash', 'delete')) throw new Error('You do not have permission to archive bank accounts.')

  const { error } = await supabase
    .schema('imagecare')
    .from('bank_accounts')
    .update({ is_active: false, updated_at: new Date().toISOString(), updated_by: userId })
    .eq('id', id)
    .eq('business_id', ctx.business_id)
  if (error) throw new Error(parseError(error).message)
}

// ---------- Statement Lines ----------
// Entered manually from the business's real paper or PDF bank
// statement. No bank API or file-import integration exists in this
// app, so this is the honest way to get statement data in.

export async function listStatementLines(bankAccountId?: string): Promise<BankStatementLine[]> {
  const lines = await getCollection<BankStatementLine>(STATEMENT_LINES_KEY, () => [])
  const scoped = bankAccountId ? lines.filter((l) => l.bankAccountId === bankAccountId) : lines
  return [...scoped].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

export async function addStatementLine(input: BankStatementLineInput, userId: string): Promise<BankStatementLine> {
  const lines = await getCollection<BankStatementLine>(STATEMENT_LINES_KEY, () => [])
  const line: BankStatementLine = {
    id: crypto.randomUUID(),
    ...input,
    isMatched: false,
    matchedMovementId: null,
    matchedAt: null,
    createdAt: new Date().toISOString(),
    createdBy: userId,
  }
  await setCollection(STATEMENT_LINES_KEY, [...lines, line])
  await enqueueSync({ entityType: 'bank_statement_line', entityId: line.id, operation: 'create' })
  return line
}

/** Deleting is only ever allowed for a line that was never matched,
 *  never a reconciled one, keeping reconciliation history permanent. */
export async function deleteStatementLine(id: string): Promise<void> {
  const lines = await getCollection<BankStatementLine>(STATEMENT_LINES_KEY, () => [])
  const line = lines.find((l) => l.id === id)
  if (line?.isMatched) throw new Error('A matched statement line cannot be deleted, unmatch it first.')
  await setCollection(
    STATEMENT_LINES_KEY,
    lines.filter((l) => l.id !== id),
  )
  await enqueueSync({ entityType: 'bank_statement_line', entityId: id, operation: 'update' })
}

// ---------- Unmatched deposits (the system side) ----------

export async function listUnmatchedDeposits(bankAccountId: string): Promise<CashMovement[]> {
  const [movements, lines] = await Promise.all([listCashMovements(), listStatementLines(bankAccountId)])
  const matchedMovementIds = new Set(lines.filter((l) => l.matchedMovementId).map((l) => l.matchedMovementId))
  return movements.filter((m) => m.type === 'bank_deposit' && m.bankAccountId === bankAccountId && !matchedMovementIds.has(m.id))
}

// ---------- Matching ----------
// "Do not alter historical transactions": matching sets a link and a
// flag on the statement line only. The CashMovement it points to is
// never edited.

export async function matchTransaction(statementLineId: string, movementId: string): Promise<BankStatementLine> {
  const [lines, movements] = await Promise.all([getCollection<BankStatementLine>(STATEMENT_LINES_KEY, () => []), listCashMovements()])
  const line = lines.find((l) => l.id === statementLineId)
  const movement = movements.find((m) => m.id === movementId)
  if (!line) throw new Error('Statement line not found.')
  if (!movement) throw new Error('Deposit not found.')
  if (line.isMatched) throw new AlreadyMatchedError()
  if (line.amountUgx !== movement.amount) throw new AmountMismatchError()

  let updated: BankStatementLine | null = null
  const next = lines.map((l) => {
    if (l.id !== statementLineId) return l
    updated = { ...l, isMatched: true, matchedMovementId: movementId, matchedAt: new Date().toISOString() }
    return updated
  })
  if (!updated) throw new Error('Statement line not found.')
  await setCollection(STATEMENT_LINES_KEY, next)
  await enqueueSync({ entityType: 'bank_statement_line', entityId: statementLineId, operation: 'update' })
  return updated
}

export async function unmatchTransaction(statementLineId: string): Promise<BankStatementLine> {
  const lines = await getCollection<BankStatementLine>(STATEMENT_LINES_KEY, () => [])
  let updated: BankStatementLine | null = null
  const next = lines.map((l) => {
    if (l.id !== statementLineId) return l
    updated = { ...l, isMatched: false, matchedMovementId: null, matchedAt: null }
    return updated
  })
  if (!updated) throw new Error('Statement line not found.')
  await setCollection(STATEMENT_LINES_KEY, next)
  await enqueueSync({ entityType: 'bank_statement_line', entityId: statementLineId, operation: 'update' })
  return updated
}

// ---------- Reconciled balance ----------

export async function getReconciledBalance(ctx: UserContext, bankAccountId: string): Promise<number> {
  const [accounts, lines] = await Promise.all([listBankAccounts(ctx), listStatementLines(bankAccountId)])
  const account = accounts.find((a) => a.id === bankAccountId)
  if (!account) return 0
  const matchedTotal = lines.filter((l) => l.isMatched).reduce((sum, l) => sum + l.amountUgx, 0)
  return account.openingBalanceUgx + matchedTotal
}

// ---------- Dashboard ----------

export async function getBankReconciliationDashboardKpis(ctx: UserContext): Promise<BankReconciliationDashboardKpis> {
  const accounts = (await listBankAccounts(ctx)).filter((a) => a.is_active)
  const allLines = await listStatementLines()

  let totalReconciledBalanceUgx = 0
  let unmatchedDepositCount = 0
  for (const account of accounts) {
    totalReconciledBalanceUgx += await getReconciledBalance(ctx, account.id)
    unmatchedDepositCount += (await listUnmatchedDeposits(account.id)).length
  }

  return {
    accountCount: accounts.length,
    totalReconciledBalanceUgx,
    unmatchedStatementLineCount: allLines.filter((l) => !l.isMatched).length,
    unmatchedDepositCount,
  }
}
