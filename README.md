# AppSec Catalog

A simple, monolithic web application designed to serve as a central hub for managing and onboarding teams to various application security tools.

## Features

- **Tool Discovery**: Browse a catalog of available AppSec tools with detailed descriptions.
- **Service Requests**: Users can submit requests for new tools or to add users to existing tools.
- **User Accounts**: A full user registration and login system.
- **Request Tracking**: Logged-in users can view the history of their own requests.
- **Admin Dashboard**: A protected admin area to view and manage all submitted requests, including adding private notes.
- **Jira Integration**: Admins can create a Jira ticket from a request with a single click.
- **Email Notifications**: Admins receive an email notification for every new request submitted.
- **Production Ready**: Uses `pm2` for process management and Prisma for safe database migrations in a production environment.

## Technology Stack

- **Backend**: Node.js, Express.js
- **Frontend**: EJS (Embedded JavaScript templates)
- **Styling**: Tailwind CSS
- **Database**: SQLite
- **ORM**: Prisma
- **Process Management**: pm2

## Setup and Installation

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later recommended)
- [npm](https://www.npmjs.com/)

### 1. Clone the Repository

```bash
git clone <repository-url>
cd appsec-catalog
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Environment Variables

Create a `.env` file in the root of the project by copying the example file:

```bash
cp .env.example .env
```

Now, open the `.env` file and fill in the required values.

```dotenv
# The location of the SQLite database file.
DATABASE_URL="file:./appsec.db"

# A long, random string used to secure user sessions.
SESSION_SECRET="your_super_secret_session_key"

# A comma-separated list of email addresses for users who should have admin privileges.
ADMIN_EMAILS="admin1@example.com,admin2@example.com"

# --- Email Configuration for SMTP ---
EMAIL_HOST=smtp.example.com
EMAIL_PORT=587
EMAIL_USER=your-smtp-username
EMAIL_PASS=your-smtp-password
EMAIL_FROM="AppSec Catalog <no-reply@example.com>"
EMAIL_TO=your-inbox@example.com

# --- Jira Integration ---
# Your Jira instance host (e.g., your-company.atlassian.net)
JIRA_HOST=
# The email address of the user that will be used to create tickets.
JIRA_USER_EMAIL=
# The API token for the Jira user.
JIRA_API_TOKEN=
```

### 4. Run Initial Database Migration

This command will create your SQLite database file (`appsec.db`) and set up all the necessary tables based on the Prisma schema.

```bash
npx prisma migrate dev --name init
```

## Running the Application

### Development Mode

For development, use the `dev` script. This will start the server with `nodemon` for automatic restarts on file changes and will also watch your CSS files for changes.

```bash
npm run dev
```

The application will be available at `http://localhost:5555` (or the port specified in your `.env` file).

### Production Mode

For a production or staging environment, use the `start` script. This will:
1. Build the production CSS.
2. Run database migrations safely with `prisma migrate deploy`.
3. Start the application in the background using `pm2`.

```bash
npm start
```

### Managing the Production Process

Once the application is running with `pm2`, you can manage it with the following commands:

- **Stop the application:**
  ```bash
  npm stop
  ```

- **Restart the application:**
  ```bash
  npm run restart
  ```

- **View logs:**
  ```bash
  npm run logs
  ```