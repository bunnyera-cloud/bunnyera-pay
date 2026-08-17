# Security policy

- Never commit `.env`, private keys, API v3 keys, certificates, tokens, passwords, SMS codes, or user payment credentials.
- Never trust browser payment results. Fulfil only after a verified server callback plus provider order query when required.
- Callback processing must be idempotent and validate merchant, order, amount, currency and final provider status.
- This baseline intentionally refuses live mode until official provider adapters are implemented and reviewed.
- Do not use this system for currency exchange, USDT conversion, fund pooling, second clearing, or collecting on behalf of unapproved third parties.
