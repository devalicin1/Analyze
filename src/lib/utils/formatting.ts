export const formatCurrency = (currency: string, value: number) => {
    const decimals = value >= 1000 ? 0 : 2
    return `${currency} ${value.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    })}`
}

export const formatPercent = (value: number) => {
    const sign = value >= 0 ? '+' : ''
    return `${sign}${value.toFixed(1)}%`
}
