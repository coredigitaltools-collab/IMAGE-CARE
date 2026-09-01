import { useMemo, useRef, useState } from 'react'
import { Download, FileMinus, Pencil, Search, Trash2, Upload, Plus } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { ExpenseTabs } from '../../components/expenses/ExpenseTabs'
import { ExpenseFormModal } from '../../components/expenses/ExpenseFormModal'
import type { ExpenseFormValues } from '../../components/expenses/ExpenseFormModal'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { RowActionButton } from '../../components/ui/RowActionButton'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { useToast } from '../../components/ui/toastContext'
import { useAuth } from '../../hooks/useAuth'
import { useStaff } from '../../features/settings/hooks/useSettingsData'
import { formatCurrency } from '../../lib/format'
import { toCsv, downloadCsv, parseCsv } from '../../lib/csv'
import { useCreateExpense, useDeleteExpense, useExpenseCategories, useExpenses, useUpdateExpense } from '../../features/expenses/hooks/useExpensesData'
import type { Expense } from '../../types/database'

// 2026-08-31: rebuilt at the user's explicit request - "do away with the
// register section...without draft,approval etc.make it simple". The old
// version had 7 status-filter tabs (draft/pending_approval/approved/
// rejected/paid/cancelled) for a workflow the backend never actually
// implemented (recordExpense() has always written every expense straight in
// as status: 'confirmed' - see engines/business/businessEngine.ts). Every
// expense here is simply "recorded": search + a month filter, a flat table,
// inline Edit/Delete, and CSV import/export.
export function ExpenseRegisterPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const expensesQuery = useExpenses()
  const categoriesQuery = useExpenseCategories()
  const staffQuery = useStaff()
  const createExpense = useCreateExpense(user.id)
  const updateExpense = useUpdateExpense(user.id)
  const deleteExpense = useDeleteExpense(user.id)

  const [search, setSearch] = useState('')
  const [month, setMonth] = useState('all')
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [editing, setEditing] = useState<Expense | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [deletingExpense, setDeletingExpense] = useState<Expense | null>(null)

  const expenses = useMemo(() => (expensesQuery.data ?? []) as Expense[], [expensesQuery.data])

  const staffNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of staffQuery.data ?? []) {
      const name = `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim()
      if (name) map.set(s.id, name)
    }
    return map
  }, [staffQuery.data])

  const nameFor = (userId: string | null) => {
    if (!userId) return '—'
    if (userId === user.id) return user.name || 'You'
    return staffNameById.get(userId) ?? '—'
  }

  // Real categories from Expenses -> Categories (not derived from past
  // expense records - a category just created there must show up here
  // immediately, even before it's ever been used on an expense).
  const activeCategories = useMemo(
    () => (categoriesQuery.data ?? []).filter((c) => c.is_active),
    [categoriesQuery.data],
  )

  const monthOptions = useMemo(() => {
    const months = new Set<string>()
    for (const e of expenses) months.add(e.expense_date.slice(0, 7))
    return Array.from(months).sort().reverse()
  }, [expenses])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return expenses
      .filter((e) => month === 'all' || e.expense_date.slice(0, 7) === month)
      .filter((e) => !q || e.category.toLowerCase().includes(q) || (e.description ?? '').toLowerCase().includes(q) || e.expense_number.toLowerCase().includes(q))
      .sort((a, b) => b.expense_date.localeCompare(a.expense_date))
  }, [expenses, month, search])

  const filteredTotal = filtered.reduce((s, e) => s + e.total_amount, 0)
  const allTimeTotal = expenses.reduce((s, e) => s + e.total_amount, 0)

  const monthLabel = (ym: string) => new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-UG', { month: 'short', year: 'numeric' })

  const handleExport = () => {
    if (filtered.length === 0) {
      showToast('No expenses to export.', 'info')
      return
    }
    const rows: Array<Array<string | number>> = [
      ['Date', 'Category', 'Description', 'Amount', 'Payment method'],
      ...filtered.map((e) => [e.expense_date.slice(0, 10), e.category, e.description ?? '', e.total_amount, e.payment_method]),
    ]
    downloadCsv(`expenses-${month === 'all' ? 'all' : month}.csv`, toCsv(rows))
    showToast(`Exported ${filtered.length} expense${filtered.length === 1 ? '' : 's'}.`, 'success')
  }

  const handleImportFile = async (file: File) => {
    setIsImporting(true)
    try {
      const text = await file.text()
      const rows = parseCsv(text)
      if (rows.length === 0) { showToast('That file has no rows.', 'info'); return }

      // Accept the same column order this page exports (Date, Category,
      // Description, Amount[, Payment method]); tolerate a header row.
      const header = rows[0].map((c) => c.trim().toLowerCase())
      const looksLikeHeader = header[0]?.includes('date')
      const dataRows = looksLikeHeader ? rows.slice(1) : rows

      let ok = 0
      let failed = 0
      for (const r of dataRows) {
        const [dateRaw, category, description, amountRaw, paymentMethodRaw] = r
        const amount = Number(String(amountRaw ?? '').replace(/[^0-9.-]/g, ''))
        // new Date(...) on an unparseable string yields "Invalid Date", and
        // .toISOString() on that throws - guard explicitly so one bad row
        // is skipped instead of aborting the whole import (the try/catch
        // below only covers the create call, not this parse step).
        const parsedDate = dateRaw ? new Date(dateRaw) : null
        const expenseDate = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString().slice(0, 10) : ''
        if (!category?.trim() || !description?.trim() || !expenseDate || !Number.isFinite(amount) || amount <= 0) {
          failed++
          continue
        }
        try {
          await createExpense.mutateAsync({
            category: category.trim(),
            description: description.trim(),
            amount,
            expenseDate,
            paymentMethod: (paymentMethodRaw?.trim() || 'cash') as 'cash' | 'mobile_money' | 'bank_transfer' | 'card',
          })
          ok++
        } catch {
          failed++
        }
      }
      showToast(failed === 0 ? `Imported ${ok} expense${ok === 1 ? '' : 's'}.` : `Imported ${ok}, skipped ${failed} invalid row${failed === 1 ? '' : 's'}.`, ok > 0 ? 'success' : 'info')
    } catch {
      showToast('Could not read that file.', 'info')
    } finally {
      setIsImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Expenses' }]} />
      <ExpenseTabs />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Expenses</h1>
          <p className="mt-0.5 text-sm text-ink-500">Every expense the business has recorded.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleImportFile(e.target.files[0])}
          />
          <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={isImporting}>
            <Upload size={15} /> {isImporting ? 'Importing…' : 'Import CSV'}
          </Button>
          <Button type="button" variant="secondary" onClick={handleExport}>
            <Download size={15} /> Export
          </Button>
          <Button onClick={() => setIsAddOpen(true)}>
            <Plus size={15} /> Add expense
          </Button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Filtered total</p>
          <p className="mt-1 text-2xl font-semibold text-ink-900">{formatCurrency(filteredTotal, 'UGX')}</p>
          <p className="mt-1 text-xs text-ink-500">{filtered.length} expense{filtered.length === 1 ? '' : 's'}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">All-time expenses</p>
          <p className="mt-1 text-2xl font-semibold text-ink-900">{formatCurrency(allTimeTotal, 'UGX')}</p>
          <p className="mt-1 text-xs text-ink-500">{expenses.length} expense{expenses.length === 1 ? '' : 's'}</p>
        </Card>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <div className="relative flex-1 sm:max-w-xs">
          <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search category or description…"
            className="w-full rounded-lg border border-ink-100 bg-white py-2.5 pl-9 pr-3 text-sm text-ink-900 shadow-card placeholder:text-ink-400 focus:border-brand-blue-500"
          />
        </div>
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-lg border border-ink-100 bg-white px-3 py-2.5 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
        >
          <option value="all">All months</option>
          {monthOptions.map((m) => (
            <option key={m} value={m}>{monthLabel(m)}</option>
          ))}
        </select>
      </div>

      <Card className="overflow-hidden">
        {expensesQuery.isLoading ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={FileMinus}
            title={expenses.length === 0 ? 'No expenses yet' : 'No expenses match your search'}
            description={expenses.length === 0 ? 'Record your first expense to get started.' : 'Try a different search term or month.'}
            action={expenses.length === 0 ? { label: '+ Add expense', onClick: () => setIsAddOpen(true) } : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-xs font-medium uppercase tracking-wide text-ink-500">
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Category</th>
                  <th className="px-5 py-3">Description</th>
                  <th className="px-5 py-3 text-right">Amount</th>
                  <th className="px-5 py-3">Month</th>
                  <th className="px-5 py-3">By</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {filtered.map((e) => (
                  <tr key={e.id} className="hover:bg-ink-50/60">
                    <td className="whitespace-nowrap px-5 py-3 text-ink-900">{new Date(e.expense_date).toLocaleDateString('en-UG', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center rounded-full bg-brand-blue-50 px-2.5 py-1 text-xs font-medium text-brand-blue-700">{e.category}</span>
                    </td>
                    <td className="max-w-xs truncate px-5 py-3 text-ink-700">{e.description || '—'}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-right font-semibold text-ink-900">{formatCurrency(e.total_amount, 'UGX')}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-ink-500">{monthLabel(e.expense_date.slice(0, 7))}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-ink-500">{nameFor(e.incurred_by)}</td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1">
                        <RowActionButton icon={Pencil} label="Edit expense" onClick={() => setEditing(e)} />
                        <RowActionButton
                          icon={Trash2}
                          label="Delete expense"
                          tone="danger"
                          onClick={() => setDeletingExpense(e)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {isAddOpen && (
        <ExpenseFormModal
          title="Add expense"
          submitLabel="Save"
          categories={activeCategories}
          onClose={() => setIsAddOpen(false)}
          onSubmit={async (input: ExpenseFormValues) => {
            await createExpense.mutateAsync({
              category: input.category,
              description: input.description,
              amount: input.amount,
              expenseDate: input.expenseDate,
            })
            showToast('Expense recorded.', 'success')
            setIsAddOpen(false)
          }}
        />
      )}

      {editing && (
        <ExpenseFormModal
          title="Edit expense"
          submitLabel="Save changes"
          lockAmount
          categories={activeCategories}
          initialValues={{
            category: editing.category,
            description: editing.description ?? '',
            amount: editing.total_amount,
            expenseDate: editing.expense_date.slice(0, 10),
          }}
          onClose={() => setEditing(null)}
          onSubmit={async (input: ExpenseFormValues) => {
            await updateExpense.mutateAsync({
              id: editing.id,
              patch: { category: input.category, description: input.description, expense_date: input.expenseDate },
            })
            showToast('Expense updated.', 'success')
            setEditing(null)
          }}
        />
      )}

      {deletingExpense && (
        <ConfirmDialog
          title="Delete this expense?"
          message="This cannot be undone."
          confirmLabel="Delete"
          tone="danger"
          onConfirm={async () => {
            await deleteExpense.mutateAsync(deletingExpense.id)
            showToast('Expense deleted.', 'success')
            setDeletingExpense(null)
          }}
          onCancel={() => setDeletingExpense(null)}
        />
      )}
    </div>
  )
}
