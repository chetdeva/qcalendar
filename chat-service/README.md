# chat-service

Generic conversations between users. It knows people only by their profile id: no roles, names or emails are stored here, and it has no student/teacher rule. Other services decide *who may talk* and the UI resolves *who is who* from the users service.

## Run

```bash
cp .env.example .env     # SUPABASE_URL, and CHAT_POLICY_URL if people should start chats
npm install
npm run dev              # http://localhost:3001, embedded Postgres in ./data/pglite when DATABASE_URL is empty
npm test                 # embedded Postgres, no setup
```

## Who may start a conversation

- A trusted backend sends `Authorization: Bearer <API_KEY>` and may open any conversation.
- A signed-in person may open one only if `CHAT_POLICY_URL` answers 2xx. chat-service calls `POST {"memberIds": [...]}` there with the **caller's own token**, and the caller must be one of the members. With no policy URL, people cannot start conversations.

In this app the policy is calendar-service's `POST /v1/chat-policy` (two people may talk when they share a class).

## API (`/v1`, bearer token)

| | |
|---|---|
| `POST /conversations {memberIds, refType?, refId?}` | Open (or fetch) a conversation. Two-person conversations are idempotent for the same pair. |
| `GET /conversations` | Mine, newest activity first, with `memberIds`, `lastMessage` and `unread`. |
| `GET /conversations/:id/messages?after=<id>&limit=` | Oldest first. No `after`: the latest `limit`. With `after`: only newer messages (polling). |
| `POST /conversations/:id/messages {body}` | 1 to 2000 characters, trimmed. |
| `POST /conversations/:id/read` | Marks everything up to now as read for me. |
| `GET /unread` | Total unread messages, e.g. for a badge. |

Non-members get **404**, so conversation ids can't be probed. `refType`/`refId` are free-text pointers that the owning service can use (for example `class` / an event id); chat never interprets them.

Not built (add when needed): older-message paging, edit/delete, attachments, rate limiting, push delivery.
