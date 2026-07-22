# Project Rules

- **Raw SQL Restrictions**:
  - Only use parameterized Prisma SQL.
  - Never concatenate SQL strings.
  - Never interpolate user input directly into any SQL queries.
  - Keep all financial data interactions fully secured against SQL injection vulnerabilities.
