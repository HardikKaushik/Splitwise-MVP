# Splitwise MVP

A REST API clone of Splitwise — track shared expenses, view balances, and receive monthly email reports. Built with **Node.js + Express + Sequelize + SQLite**.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Runtime | Node.js |
| Framework | Express 4 |
| ORM | Sequelize 6 |
| Database | SQLite (zero-setup, file-based) |
| Email | Nodemailer (Ethereal test account in dev) |
| Validation | Yup |
| Password hashing | bcryptjs |
| Transpilation | Sucrase |

---

## Project Structure

```
src/
├── config/
│   └── database.js              # Sequelize connection config
├── controllers/
│   ├── user.controller.js       # Register, login, profile CRUD
│   ├── expense.controller.js    # Expense CRUD + activity log
│   └── balance.controller.js    # Net balances + monthly report
├── models/
│   ├── User.js                  # Users table
│   ├── Expense.js               # Expenses table
│   └── ExpenseParticipant.js    # Expense split participants
├── routes/
│   ├── user.routes.js
│   ├── expense.routes.js
│   └── balance.routes.js
├── services/
│   ├── express.service.js       # Server bootstrap
│   ├── sequelize.service.js     # DB init + auto-sync
│   └── email.service.js         # Nodemailer setup
├── middlewares/
│   └── errorHandler.middleware.js
├── utils/
│   └── ApiError.js              # Typed HTTP error classes
└── index.js
```

---

## Database Schema

### Users
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | Auto-increment |
| name | STRING | Required |
| email | STRING UNIQUE | Required |
| password_hash | STRING | bcrypt, 8 rounds |
| default_currency | STRING(10) | Default: `USD` |
| createdAt / updatedAt | DATETIME | Auto-managed |

### Expenses
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | Auto-increment |
| name | STRING | Required |
| description | TEXT | Optional |
| value | DECIMAL(10,2) | Required, total bill amount |
| currency | STRING(10) | Required |
| date | DATEONLY | Required |
| paid_by | INTEGER FK → Users | Who paid the bill |
| createdAt / updatedAt | DATETIME | Auto-managed |

### ExpenseParticipants
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | Auto-increment |
| expense_id | INTEGER FK → Expenses | Cascades on delete |
| user_id | INTEGER FK → Users | The participant |
| share_amount | DECIMAL(10,2) | How much this user owes |
| createdAt / updatedAt | DATETIME | Auto-managed |

> **Balance logic** is computed dynamically — no separate table.
> `net > 0` → other user owes you · `net < 0` → you owe them

---

## Setup & Running

### Prerequisites
- Node.js ≥ 16
- npm

### Install
```bash
git clone <repo-url>
cd splitwise
npm install
```

### Configure environment
Create a `.env` file in the project root:
```env
SERVER_PORT=3001
NODE_ENV=development

DB_DIALECT=sqlite
DB_STORAGE=./splitwise.db

# Email — leave blank to use Ethereal (test inbox)
SMTP_HOST=smtp.ethereal.email
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=splitwise@example.com
```

### Start dev server
```bash
npm run dev
```

The SQLite database file (`splitwise.db`) is created automatically on first boot. You should see:
```
[EXPRESS] Express initialized
[SEQUELIZE] Database service initialized
[EMAIL] Using Ethereal test account: ...
Server initialized.
```

---

## Authentication

There is no JWT layer in this MVP. Pass the user's ID in every request header:

```
x-user-id: 1
```

The `id` is returned by both **Register** and **Login**.

---

## API Reference

Base URL: `http://localhost:3001`

---

### Users

#### `POST /users/register`
Create a new account.

**Body**
```json
{
  "name": "Alice",
  "email": "alice@example.com",
  "password": "secret123",
  "default_currency": "USD"
}
```

**Response `201`**
```json
{
  "id": 1,
  "name": "Alice",
  "email": "alice@example.com",
  "default_currency": "USD",
  "createdAt": "2026-05-07T13:57:47.621Z"
}
```

---

#### `POST /users/login`
Login with email and password.

**Body**
```json
{
  "email": "alice@example.com",
  "password": "secret123"
}
```

**Response `200`**
```json
{
  "message": "Login successful",
  "user_id": 1,
  "name": "Alice",
  "email": "alice@example.com",
  "default_currency": "USD"
}
```

---

#### `GET /users/profile`
Get the acting user's profile.

**Headers:** `x-user-id: 1`

**Response `200`**
```json
{
  "id": 1,
  "name": "Alice",
  "email": "alice@example.com",
  "default_currency": "USD",
  "createdAt": "...",
  "updatedAt": "..."
}
```

---

#### `PUT /users/profile`
Update email and/or default currency.

**Headers:** `x-user-id: 1`

**Body**
```json
{
  "email": "alice_new@example.com",
  "default_currency": "EUR"
}
```

**Response `200`** — updated user object.

---

#### `DELETE /users/profile`
Permanently delete the acting user's account.

**Headers:** `x-user-id: 1`

**Response `200`**
```json
{ "message": "Account deleted successfully" }
```

---

### Expenses

#### `POST /expenses`
Add a new expense. The acting user is the payer. The sum of all `share_amount` values must equal `value`.

**Headers:** `x-user-id: 1`

**Body**
```json
{
  "name": "Dinner",
  "description": "Pizza night",
  "value": 90,
  "currency": "USD",
  "date": "2026-05-07",
  "members": [
    { "user_id": 1, "share_amount": 30 },
    { "user_id": 2, "share_amount": 60 }
  ]
}
```

**Response `201`** — expense object with participants.

---

#### `GET /expenses/:id`
Get full details of an expense. Only accessible by the payer or a participant.

**Headers:** `x-user-id: 1`

**Response `200`**
```json
{
  "id": 1,
  "name": "Dinner",
  "value": 90,
  "currency": "USD",
  "date": "2026-05-07",
  "paid_by": 1,
  "paidByUser": { "id": 1, "name": "Alice", "email": "alice@example.com" },
  "participants": [
    {
      "user_id": 2,
      "share_amount": 60,
      "user": { "id": 2, "name": "Bob", "email": "bob@example.com" }
    }
  ]
}
```

---

#### `PUT /expenses/:id`
Update an expense. Only the payer can do this. Providing `members` fully replaces all participants.

**Headers:** `x-user-id: 1`

**Body** *(all fields optional)*
```json
{
  "name": "Pizza Dinner",
  "value": 120,
  "members": [
    { "user_id": 1, "share_amount": 60 },
    { "user_id": 2, "share_amount": 60 }
  ]
}
```

**Response `200`** — updated expense object with participants.

---

#### `DELETE /expenses/:id`
Delete an expense and all its participant records. Only the payer can do this.

**Headers:** `x-user-id: 1`

**Response `200`**
```json
{ "message": "Expense deleted successfully" }
```

---

#### `GET /expenses/activity`
Activity log of all expenses the user is involved in (as payer or participant), grouped into `current_month`, `last_month`, and `older`.

**Headers:** `x-user-id: 1`

**Query params**

| Param | Values | Notes |
|---|---|---|
| `period` | `current_month` \| `last_month` \| `custom` | Optional — no filter if omitted |
| `start_date` | `YYYY-MM-DD` | Required when `period=custom` |
| `end_date` | `YYYY-MM-DD` | Required when `period=custom` |

**Examples**
```
GET /expenses/activity?period=current_month
GET /expenses/activity?period=last_month
GET /expenses/activity?period=custom&start_date=2026-04-01&end_date=2026-05-31
```

**Response `200`**
```json
{
  "current_month": [ ],
  "last_month":    [ ],
  "older":         [ ]
}
```

---

### Balances

#### `GET /balances`
Get net balances for the acting user against every other user they share expenses with.

**Headers:** `x-user-id: 1`

**Response `200`**
```json
{
  "balances": [
    {
      "user": { "id": 2, "name": "Bob", "email": "bob@example.com" },
      "net": 60,
      "currency": "USD",
      "summary": "Bob owes you"
    }
  ]
}
```

> `net > 0` → the other person owes you
> `net < 0` → you owe the other person
> `net = 0` → settled up

---

#### `POST /balances/report`
Send a monthly balance summary email to the acting user.

**Headers:** `x-user-id: 1`

**Response `200`**
```json
{
  "message": "Monthly balance report sent to alice@example.com",
  "messageId": "<abc123@example.com>",
  "previewUrl": "https://ethereal.email/message/..."
}
```

> In development (no SMTP credentials set), emails are sent via [Ethereal](https://ethereal.email). The `previewUrl` in the response lets you view the email in the browser instantly.

---

## Error Responses

All errors follow a consistent format:

| Status | Meaning |
|---|---|
| `400` | Bad request / validation failure |
| `401` | Invalid credentials |
| `403` | Forbidden (e.g. non-payer trying to delete an expense) |
| `404` | Resource not found |
| `500` | Internal server error |

---

## Importing into Postman

1. Open Postman → **Import** → select `postman.json` from the project root
2. Set the `base_url` collection variable to `http://localhost:3001`
3. After **Register** or **Login**, copy the returned `id` into the `user_id` collection variable — all other requests use it automatically as the `x-user-id` header
