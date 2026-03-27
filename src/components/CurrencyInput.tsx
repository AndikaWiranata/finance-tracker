'use client'
import React, { useRef, useEffect } from 'react'
import { formatNumberInput } from '@/lib/currency'

interface CurrencyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string
  onValueChange: (value: string) => void
}

export default function CurrencyInput({ value, onValueChange, ...props }: CurrencyInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const cursorPosition = useRef<number | null>(null)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = e.target
    const originalValue = el.value
    const selectionStart = el.selectionStart || 0

    // Count how many non-separator characters are before the cursor
    const nonSeparatorsBeforeCursor = originalValue.slice(0, selectionStart).replace(/\./g, '').length

    const formattedValue = formatNumberInput(originalValue)
    
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
        if (targetValue[i] !== '.') {
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
  }, [value])

  return (
    <input
      {...props}
      ref={inputRef}
      type="text"
      value={value}
      onChange={handleChange}
    />
  )
}
