export interface CurrencyInfo {
    code: string;
    name: string;
    symbol?: string;
}

/**
 * Standardized ISO 4217 currencies supported by the European Central Bank (ECB) via Frankfurter API.
 */
export const FRANKFURTER_CURRENCIES: CurrencyInfo[] = [
    { code: "PHP", name: "Philippine Peso", symbol: "₱" },
    { code: "USD", name: "United States Dollar", symbol: "$" },
    { code: "EUR", name: "Euro", symbol: "€" },
    { code: "JPY", name: "Japanese Yen", symbol: "¥" },
    { code: "CNY", name: "Chinese Renminbi Yuan", symbol: "¥" },
    { code: "GBP", name: "British Pound", symbol: "£" },
    { code: "AUD", name: "Australian Dollar", symbol: "A$" },
    { code: "CAD", name: "Canadian Dollar", symbol: "C$" },
    { code: "SGD", name: "Singapore Dollar", symbol: "S$" },
    { code: "CHF", name: "Swiss Franc", symbol: "CHF" },
    { code: "HKD", name: "Hong Kong Dollar", symbol: "HK$" },
    { code: "KRW", name: "South Korean Won", symbol: "₩" },
    { code: "MYR", name: "Malaysian Ringgit", symbol: "RM" },
    { code: "THB", name: "Thai Baht", symbol: "฿" },
    { code: "INR", name: "Indian Rupee", symbol: "₹" },
    { code: "IDR", name: "Indonesian Rupiah", symbol: "Rp" },
    { code: "NZD", name: "New Zealand Dollar", symbol: "NZ$" },
    { code: "BRL", name: "Brazilian Real", symbol: "R$" },
    { code: "MXN", name: "Mexican Peso", symbol: "Mex$" },
    { code: "SEK", name: "Swedish Krona", symbol: "kr" },
    { code: "NOK", name: "Norwegian Krone", symbol: "kr" },
    { code: "DKK", name: "Danish Krone", symbol: "kr" },
    { code: "PLN", name: "Polish Zloty", symbol: "zł" },
    { code: "CZK", name: "Czech Koruna", symbol: "Kč" },
    { code: "HUF", name: "Hungarian Forint", symbol: "Ft" },
    { code: "ILS", name: "Israeli New Shekel", symbol: "₪" },
    { code: "TRY", name: "Turkish Lira", symbol: "₺" },
    { code: "ZAR", name: "South African Rand", symbol: "R" },
    { code: "RON", name: "Romanian Leu", symbol: "lei" },
    { code: "BGN", name: "Bulgarian Lev", symbol: "лв" },
    { code: "ISK", name: "Icelandic Krona", symbol: "kr" },
];

export const CURRENCY_MAP = new Map<string, CurrencyInfo>(
    FRANKFURTER_CURRENCIES.map((c) => [c.code, c])
);
