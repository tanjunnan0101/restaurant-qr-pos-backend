# Order and Printer Flow

## Order safety rules

- Every QR submission requires an `Idempotency-Key`.
- Reusing the key with the same payload returns the existing order.
- Reusing the key with a changed payload returns `409`.
- The API ignores client prices and calculates all totals from the current
  published menu.
- Sold-out or inactive items are rejected before an order is created.
- Kitchen tickets and print jobs are not created until payment is confirmed or
  manual PayNow is verified by authorised staff.

## Configure a Wi-Fi/LAN printer

Call:

`POST /api/v1/admin/outlets/:outletId/printing/setup`

For a normal ESC/POS network thermal printer use:

- `connectionType`: `ESC_POS_LAN`
- `host`: the printer's fixed LAN IP, for example `192.168.1.50`
- `port`: normally `9100`
- `paperWidthMm`: normally `80` or `58`

The setup request can create:

- Kitchen and bar stations.
- Primary and backup printers.
- An optional receipt printer with role `RECEIPT`.
- Station-to-printer routes.
- One local printer-agent credential.

The raw agent key is returned only when the agent is first created or when
`rotateKey: true` is requested. Store it securely on the restaurant computer.

## Run the local printer agent

Build once:

```powershell
npm run build --workspace @restaurant-pos/printer-agent
```

Set the values returned by printer setup:

```powershell
$env:PRINTER_API_BASE_URL = "https://api.example.com/api/v1"
$env:PRINTER_AGENT_ID = "<agent-id>"
$env:PRINTER_AGENT_KEY = "<one-time-agent-key>"
npm run start --workspace @restaurant-pos/printer-agent
```

The computer running the agent must be on the same LAN or Wi-Fi network as the
printer and must be able to reach the printer IP and port.

When an active printer with role `RECEIPT` is configured for the outlet, paid
orders now also queue one customer receipt print job in addition to the routed
kitchen or bar ticket jobs.

## Test and monitor

Queue a test print:

`POST /api/v1/admin/outlets/:outletId/printing/printers/:printerId/test`

The agent:

1. Authenticates with its agent ID and key.
2. Leases one print job for 60 seconds.
3. Opens a TCP connection to the printer.
4. Sends ESC/POS initialise, ticket text, optional buzzer, and cut commands.
5. Reports printed or failed status.

Failed jobs retry after 5, 15, and 60 seconds. After the third failed primary
attempt, the job routes immediately to the configured backup printer. Final
failures remain visible for manual retry.

## Production network checklist

- Reserve a fixed printer IP in the router or configure a static IP.
- Confirm the printer supports ESC/POS over TCP.
- Permit outbound HTTPS from the agent computer to the API.
- Permit local TCP traffic from the agent computer to printer port `9100`.
- Disable sleep on the agent computer during restaurant operating hours.
- Use a supervised process or Windows service for automatic agent restart.
- Run a real kitchen ticket, reprint, failure, and backup-printer test before
  launching the outlet.
