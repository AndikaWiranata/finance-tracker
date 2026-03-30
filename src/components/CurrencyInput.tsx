'use client'
import React, { useRef, useEffect } from 'react'
import { formatNumberInput } from '@/lib/currency'

interface CurrencyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string
  onValueChange: (value: string) => void
  currency?: string
}

export default function CurrencyInput({ value, onValueChange, currency = 'IDR', ...props }: CurrencyInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const cursorPosition = useRef<number | null>(null)

  const isIDR = currency === 'IDR'
  const decimalSep = isIDR ? ',' : '.'
  const thousandSep = isIDR ? '.' : ','
  const symbol = currency === 'IDR' ? 'Rp' : (currency === 'USD' ? '$' : currency)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = e.target
    const originalValue = el.value
    const selectionStart = el.selectionStart || 0

    // Count how many non-separator characters are before the cursor
    const stripRegex = new RegExp(`\\${thousandSep}`, 'g')
    const nonSeparatorsBeforeCursor = originalValue.slice(0, selectionStart).replace(stripRegex, '').length

    const formattedValue = formatNumberInput(originalValue, currency)
    
    // Store the count of non-separators to restore later
    cursorPosition.current = nonSeparatorsBeforeCursor
    
    onValueChange(formattedValue)
  }

  useEffect(() => {
    if (inputRef.current && cursorPosition.current !== null) {
      const el = inputRef.current
      const targetValue = el.value
      
      let newPos = 0
      let nonSeparatorCount = 0
      
      // Find the position in formatted value that matches the non-separator count
      for (let i = 0; i < targetValue.length; i++) {
        if (targetValue[i] !== thousandSep) {
          nonSeparatorCount++
        }
        if (nonSeparatorCount === cursorPosition.current) {
          newPos = i + 1
          break
        }
        newPos = i + 1
      }
      
      el.setSelectionRange(newPos, newPos)
      cursorPosition.current = null
    }
  }, [value, thousandSep])

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <span style={{ 
        position: 'absolute', 
        left: 12, 
        top: '50%', 
        transform: 'translateY(-50%)', 
        color: 'var(--text-muted)', 
        fontSize: 14,
        fontWeight: 600,
        pointerEvents: 'none'
      }}>
        {symbol}
      </span>
      <input
        {...props}
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleChange}
        style={{ 
          ...props.style,
          paddingLeft: symbol.length === 1 ? 32 : (symbol.length * 10 + 20)
        }}
      />
    </div>
  )
}
