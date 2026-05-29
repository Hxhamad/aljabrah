# Install Into The Real Google Sheet With clasp

Target Sheet:

https://docs.google.com/spreadsheets/d/1MCn2BCV6ZT6rTolYq1kssxRNjkp76ES5vuZ6UlEulm8/edit

## One-time setup

Run these commands from this repo:

```bash
npm install
npm run verify
npm run clasp:login
npm run clasp:create
npm run clasp:push
npm run clasp:open
```

`clasp:login` opens a Google authorization page. Use the same Google account that can edit the target Sheet.

`clasp:create` intentionally does not pass `--type sheets`. With `clasp`, `--type sheets` creates a new spreadsheet; passing only `--parentId` binds the script to the existing Sheet above.

If Google says the Apps Script API is disabled, enable it here and retry:

https://script.google.com/home/usersettings

## First run in Apps Script

After `npm run clasp:open` opens the Apps Script project:

1. Select `setupStockAnalyticsWorkbook` from the function dropdown.
2. Click `Run`.
3. Approve permissions.
4. Return to the Google Sheet and reload it.
5. Use `Stock Analytics -> Seed Sample Data` for the first test build.
6. Use `Stock Analytics -> Validate Workbook`.

## If the Sheet already has a bound script

If `npm run clasp:create` fails because the Sheet already has an Apps Script project:

1. Open the Sheet.
2. Go to `Extensions -> Apps Script`.
3. Open `Project Settings`.
4. Copy the Script ID.
5. Create a local `.clasp.json` file:

```json
{
  "scriptId": "PASTE_SCRIPT_ID_HERE",
  "rootDir": "."
}
```

6. Run:

```bash
npm run clasp:push
```

`.clasp.json` is intentionally ignored by git because it is a local binding to your Google project.
