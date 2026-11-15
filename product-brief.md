# Product Brief: SoChill

## 1. Overview

A simple, mobile-friendly website for **SoChill**, a study break event offering free bubble tea and snacks.

**Event Details**

- Date: 20 November 2026
- Time: 7:00 PM – 9:00 PM
- Location: NUS COM1 Foyer
- Capacity: 150 participants

Students can register their interest by entering their email and clicking "Count Me In". They will receive a confirmation email, possibly delayed if the free email quota is reached. No reminder email is sent.

## 2. Tech Stack

| Component  | Technology                |
| ---------- | ------------------------- |
| Frontend   | React + Vite + TypeScript |
| Styling    | Tailwind CSS              |
| Database   | Supabase PostgreSQL       |
| Backend    | Supabase Edge Functions   |
| Email      | Resend                    |
| Scheduling | Supabase Cron for delayed confirmations |
| Deployment | Vercel                    |

## 3. Functional Requirements

### Event Website

- Display event details and the number of registered participants.
- Mobile-friendly, clean and visually appealing design.
- Prominent "Count Me In" button.

### Registration

- Clicking "Count Me In" opens an email input form. Email input must use (dialog component)[[https://ui.shadcn.com/docs/components/base/dialog](https://ui.shadcn.com/docs/components/base/dialog)]&#x20;
- Support browser email autofill.
- Each email can only register once.
- Save registrations securely in Supabase.
- Use `localStorage` to remember registration status.
- Limit registrations to 150, enforced by the database.
- Check if email is already recorded. If so, reject the registration saying that the user has already registered.&#x20;
- Disable registration once capacity is reached.
- Show a success message after registration.

### Email Notifications

- Attempt a confirmation email immediately after successful registration. If the free daily email quota is reached, queue it and send it when capacity becomes available.
- Use Supabase Cron to retry pending confirmations. Prevent duplicate confirmation emails.
- Do not send reminder emails.

### Security

- Users cannot directly modify the registration count.
- Validate registrations on the backend.
- Prevent duplicate registrations using a unique email constraint.
- Enforce the capacity limit atomically.
- Keep API keys and registered emails private.
- Apply basic rate limiting to prevent spam.

## 4. Out of Scope

- User login or authentication
- QR code check-in
- Attendance tracking
- Organiser dashboard
- Telegram integration
- Payment system

## 5. Deliverables

- Responsive event website deployed on Vercel.
- Supabase database and Edge Functions.
- Automated confirmation emails, including delayed delivery when the free email quota is reached.
- GitHub repository with setup instructions and documented limitations.

## 6. Data Model

The registration table uses `email` as its primary key, with minimal confirmation-delivery metadata. A small second table stores rate-limit counters.&#x20;

## 7. Design

- Must use shadcn components. MCP server for shadcn is already installed.&#x20;
- Must use Memphis Design with fun, bright and youthful colors.&#x20;
- Follow Dont repeat yourself principle. Keep the codebase clean and modular.&#x20;

## 8. Pages

Home page: Information about the event. Countdown till the event starting time from now. Number of sign ups and "count me in" button in the middle.&#x20;

Contact Organizers page: Information showing "for event related matters: contact @organizer on Telegram, for website related matter: contact @winhks25 on telegram". Write it in fun way. Organizer page is not separate page. There must be a "contact us" button on navbar and when clicked, it must appear as a right drawer ([https://ui.shadcn.com/docs/components/base/drawer](https://ui.shadcn.com/docs/components/base/drawer)).&#x20;

**Goal:** Build a simple, reliable registration website with minimal complexity and free-tier services.

**Target development time:** 2–3 hours.
