import { SupabaseClient } from '@supabase/supabase-js'
import { getLocalDateISO } from './date'

export async function processRecurringTransactions(supabase: SupabaseClient, userId: string) {
  const today = getLocalDateISO()

  // 1. Fetch due recurring transactions
  const { data: recurring, error } = await supabase
    .from('recurring_transactions')
    .select('*, accounts(balance)')
    .eq('user_id', userId)
    .eq('active', true)
    .lte('next_date', today)

  if (error || !recurring || recurring.length === 0) return []

  const processed: string[] = []

  for (const item of recurring) {
    let currentNext = new Date(item.next_date)
    const todayDate = new Date(today)

    // Process all missed occurrences (in case user didn't login for days/months)
    while (currentNext <= todayDate) {
      const execDate = currentNext.toISOString().slice(0, 10)

      // Create the real transaction
      const { error: txError } = await supabase.from('transactions').insert({
        user_id: userId,
        account_id: item.account_id,
        type: item.type,
        amount: item.amount,
        category: item.category,
        note: `[Otomatis] ${item.note || ''}`.trim(),
        date: execDate
      })

      if (txError) {
        console.error('Gagal memproses transaksi rutin:', txError)
        break
      }

      // Update Account Balance
      const delta = item.type === 'income' ? Number(item.amount) : -Number(item.amount)
      const currentBalance = Number(item.accounts?.balance || 0)
      
      await supabase.from('accounts')
        .update({ balance: currentBalance + delta })
        .eq('id', item.account_id)

      processed.push(`${item.category} (${execDate})`)

      // Calculate next date
      if (item.frequency === 'daily') {
        currentNext.setDate(currentNext.getDate() + 1)
      } else if (item.frequency === 'weekly') {
        currentNext.setDate(currentNext.getDate() + 7)
      } else if (item.frequency === 'monthly') {
        currentNext.setMonth(currentNext.getMonth() + 1)
      } else if (item.frequency === 'yearly') {
        currentNext.setFullYear(currentNext.getFullYear() + 1)
      }
    }

    // Update the recurring record with the final next_date
    await supabase.from('recurring_transactions')
      .update({
        next_date: currentNext.toISOString().slice(0, 10),
        last_date: today
      })
      .eq('id', item.id)
  }

  return processed
}
