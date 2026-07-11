"use client";
import React, { useState, useEffect } from 'react';

export default function FormattedNumberInput({
  value,
  onChange,
  className = "",
  placeholder = "0.00",
  disabled = false,
  ...props
}) {
  const [displayValue, setDisplayValue] = useState('');

  useEffect(() => {
    // Sync external value to internal display state
    if (value === null || value === undefined || isNaN(value)) {
      setDisplayValue('');
    } else {
      setDisplayValue(formatNumber(value));
    }
  }, [value]);

  const formatNumber = (val) => {
    if (!val) return '';
    const num = parseFloat(val);
    if (isNaN(num)) return '';
    
    // Format to 2 decimal places with commas
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  };

  const handleChange = (e) => {
    let inputVal = e.target.value;
    
    // Allow empty
    if (inputVal === '') {
      setDisplayValue('');
      if (onChange) onChange(null);
      return;
    }

    // Remove all non-numeric characters except for decimal point and minus sign
    let numericStr = inputVal.replace(/[^0-9.-]/g, '');
    
    // Prevent multiple decimal points
    const parts = numericStr.split('.');
    if (parts.length > 2) {
      numericStr = parts[0] + '.' + parts.slice(1).join('');
    }
    
    // Prevent multiple minus signs or minus sign not at the start
    if (numericStr.lastIndexOf('-') > 0) {
      numericStr = numericStr.replace(/-/g, '');
    }

    setDisplayValue(numericStr); // temporarily show what they are typing without formatting

    const num = parseFloat(numericStr);
    if (!isNaN(num) && onChange) {
      onChange(num);
    }
  };

  const handleBlur = () => {
    // Format on blur if there's a valid number
    if (displayValue && displayValue !== '-') {
      const num = parseFloat(displayValue.replace(/,/g, ''));
      if (!isNaN(num)) {
        setDisplayValue(formatNumber(num));
      } else {
        setDisplayValue('');
        if (onChange) onChange(null);
      }
    }
  };

  return (
    <input
      type="text"
      value={displayValue}
      onChange={handleChange}
      onBlur={handleBlur}
      disabled={disabled}
      placeholder={placeholder}
      className={`form-input font-inter tabular-nums text-right ${className}`}
      {...props}
    />
  );
}
