### * - Purpose: UpScale Resale Flow: To streamline an event process
### * - The Idea: 
- Before the event: Each designer gets a unique link to submit their inventory. A staff dashboard shows who's submitted, who hasn't, and lets staff manually add stragglers fast
- During checkout: Volunteer pulls up the app, types or scans an item ID, customer info is entered once (not per item), system auto-generates a confirmation number and marks every item sold simultaneously — no stickers, no carbon copy
- Customer receipt: A QR code or 4-digit confirmation shown on screen — customer screenshots it or we text it to their phone number
- Saturday pickup: Staff types confirmation number, sees exactly what they bought, checks them out and marks "picked up"
- Works on cell service, no WiFi dependency

okay, I have a problem. I work at a habitat for humanbity, and once a year we hold an event called UpScale Resale. basically for a few months, designers come into our Restores and find items to upscale. we then hold the event at a hotel, and we setup 10x10 walls, and the designers get to decorate and display their hard work for the public to buy.
On friday night it is the vip party. food, alcohol, and people buying the items. Saturday it's for all of the public to have access to what is left.
Here is the problem... the entire way how we do the purchases. You seem, we use something called Zettle. that is how we process the card transactions. the big issue is how we mark things that are sold. let me lay it all out.
On friday, people can walk up to the designers booth and purchase item, but they can't take their item with them that night, it has to stay until the even is over, at 2pm saturday. they then can come back and pick it up. they also have an option for delievry, with is a 25$ one time purchase.
You see, each booth and item is labeled. this is a nightmare the way we do it. we have the designers mark and price each item in their booth. ex. if booth one had 10 items, it would go:

The 4 Stages of the Problem

Stage 1 — Designer Inventory Submission (Before the Event)
Problem: Designers submit incomplete lists, forget booth #, item #, or don't submit at all.
Solution:

Instead of accepting a free-form Excel sheet, designers get a unique submission link tied to their booth number already baked in. They literally cannot forget their booth # because the form knows who they are.
The form fields are required — no submission without item #, description, price, and quantity. No freeform uploads.
Staff gets a submission dashboard showing a green/red status per booth. Red means incomplete or not submitted. Staff can chase down the 3 stragglers before Friday instead of finding out at 6pm.
Staff can also manually enter stragglers directly into the system if a designer just won't comply.


Stage 2 — Item Tagging (The Physical Label Problem)
This is the sneakiest problem because no app fully eliminates the need for a physical tag — items still need to be identified on the floor. But we can make the tags foolproof and pre-generated.
Problem: Designers handwrite tags, miss fields, make errors.
Solution:

Once a designer submits their inventory through the app, the system auto-generates a print-ready tag sheet for every item in their booth — already filled out with booth #, item #, price, and description.
You print them, hand them to the designer. They just attach them. No writing, no missing fields.
Each tag also gets a QR code that points to that exact item in the database. This is the bridge to Stage 3.
For the stragglers who don't submit early, staff enters their items manually and prints tags on the spot. Controlled chaos instead of uncontrolled chaos.


Stage 3 — Checkout on the Floor (The Big One)
Problem: Carbon copy is doing too many jobs. Writing is illegible, customers don't press hard enough, helper/cashier roles are blurry, no real-time sold status.
Solution — the new checkout flow:

Customer wants to buy item 6-2 (the rug). The volunteer either:

Scans the QR code on the tag with their phone camera, OR
Types the item ID (6-2) into the app — item name and price auto-populate


Volunteer adds as many items as the customer is buying — all in one transaction, like a cart
One screen asks: Pickup Saturday or Delivery (+$25)?
One screen captures: Name, phone number, email (optional)
Transaction is processed through Zettle as normal — that part doesn't change
App immediately:

Marks every item in that cart as SOLD in real time
Generates a confirmation number (e.g., #A47)
Sends an SMS to their phone with their confirmation # and item list
If delivery — flags the order as delivery with their address


The volunteer slaps a pre-printed generic SOLD sticker on the item — just the confirmation number written on it. That's it. No names, no 1of3/2of3, no pink slips taped to anything.

The customer's phone IS their receipt. The confirmation # is their proof.

Stage 4 — Post-Event: Pickup & Delivery Sorting
Problem: After the show, delivery items need to be grouped by person. Saturday pickup needs verification. Right now it's all paper.
Solution:

Staff pulls up the app and hits "End of Event" view
Two lists auto-generate:

DELIVERY orders — sorted by person, showing every item they bought with booth/item # so staff can locate and group them physically
PICKUP orders — same list for Saturday


Saturday pickup: customer gives their name or shows their SMS confirmation #. Volunteer looks it up, sees the items, marks them "Picked Up" in the app. Done.
Any items NOT marked picked up by end of Saturday are flagged automatically — so you know exactly what wasn't claimed.

The App Has 3 User Types
1. Staff/Admin
Full access. Manages the event, designers, inventory, checkout, and post-event logistics.
2. Designer
Gets a unique link. Can only see and submit their own booth inventory. No login required — link is their access.
3. Customer
Never touches the app. They just receive an email receipt.

Screen Map:
STAFF SIDE
├── Login
├── Event Dashboard (home base)
│   ├── Submission Tracker (who submitted, who hasn't)
│   ├── Inventory Master View (all booths, all items, sold/available status)
│   └── Live Stats (items sold, revenue, orders)
├── Checkout Screen (cashier view — the most important screen)
│   ├── QR Scan OR manual item ID entry
│   ├── Cart (multiple items, one transaction)
│   ├── Pickup vs Delivery toggle (+$25)
│   ├── Customer info form
│   └── Confirmation # generated + email sent
├── Print Tags (per booth, QR codes included)
└── End of Event View
    ├── Delivery List (sorted by customer)
    └── Pickup List (sorted by customer, mark as picked up)

DESIGNER SIDE
└── Submission Form (unique link, booth # pre-filled)
    ├── Add items (item #, description, price, quantity)
    ├── Edit/delete before deadline
    └── Submission confirmed view


    Firebase Data Structure
Designed to minimize reads/writes:
/events/{eventId}
  - name, status, date

/events/{eventId}/booths/{boothId}
  - boothNumber, designerName, designerEmail
  - submissionStatus: pending | submitted | approved

/events/{eventId}/items/{itemId}
  - itemCode: "6-2"
  - boothNumber: 6
  - description: "Rug"
  - price: 35
  - quantity: 1
  - status: available | sold | pickedup
  - orderId: null (fills in when sold)

/orders/{orderId}
  - confirmationNumber: "A47"
  - customerName, customerEmail
  - fulfillmentType: pickup | delivery
  - deliveryAddress (if applicable)
  - items: [ array of itemCodes ]
  - totalAmount
  - status: sold | pickedup | delivered
  - eventId, createdAt

Build Order:
Build Order
We build this in phases so you have something usable at each step:
Phase 1 — The Foundation
Firebase setup, auth, basic event creation, staff dashboard shell
Phase 2 — Inventory System
Designer submission form + unique links, staff inventory view, print-ready tag generator with QR codes
Phase 3 — Checkout Flow
The cashier screen — QR scan + manual entry, cart, pickup/delivery toggle, customer info, confirmation # generation, EmailJS receipt
Phase 4 — End of Event
Delivery list, pickup list, mark as picked up, unclaimed item flagging



What we have done so far:

- Setup supabase
- Setup Dashboard
- Setup Booth Management
- Inventory
- Checkout
- print Tags
- end of event screen

### [2025-04-25]
- DesignerSubmit.jsx: Added duplicate item code guard in handleSaveItem — alerts and blocks save if item_code already exists for that booth (edit mode exempts the item being edited)
- DesignerSubmit.jsx: Added handleUnsubmit function + "↩ Reopen" button — visible only when submission_status === 'submitted', sets status back to in_progress so organizers know changes are pending
- EndOfEvent.jsx: Refactored filterOrders to only filter by fulfillment type (no search logic); added separate searchResults computed value that bypasses tabs entirely when search is active
- EndOfEvent.jsx: Search now covers customer_phone (strips non-digits for flexible matching like "910" or "9105550100")
- EndOfEvent.jsx: Search results render a unified list with a Pickup/Delivery badge per order and the correct mark action button inline

### [2025-04-25]
- EndOfEvent.jsx: Full redesign — removed tab-based navigation entirely; replaced with search-first UX (empty state until user types)
- EndOfEvent.jsx: Search results now group all orders by customer (name+phone key), showing a single unified customer card per person
- EndOfEvent.jsx: Customer card splits into two clear sections: 🚚 Delivery and 📍 Pickup, each with their own items and action buttons
- EndOfEvent.jsx: Added "✓ Delivery Paid" badge on customers who have any delivery order
- EndOfEvent.jsx: Added "Add to Delivery" button on pickup orders when the customer has already paid the delivery fee — moves order to delivery at no charge, inheriting the existing delivery address
- EndOfEvent.jsx: Added handleMarkDelivered as a dedicated function (previously was inline anonymous async)
- EndOfEvent.jsx: Fixed phone search bug — empty string from stripping non-digits was matching all customers; added sDigits.length > 0 guard before phone comparison
### [2026-04-26]
- EndOfEvent.jsx: Replaced search-only UX with 3-tab layout — Pickup, Delivery, Search
- EndOfEvent.jsx: Pickup and Delivery tabs show all pending customers with full order details by default (no search required)
- EndOfEvent.jsx: Tab badges show live pending counts; highlight yellow for pickup, blue for delivery
- EndOfEvent.jsx: Search tab preserved as-is for lookup by name/confirmation/phone
- EndOfEvent.jsx: Added pre-computed pickupGroups and deliveryGroups from pending orders
### [2026-04-26]
- Checkout.jsx: Added checkExistingDelivery() — queries orders by last 7 digits of phone to detect if customer already paid the $25 delivery fee
- Checkout.jsx: deliveryFee set to $0 when deliveryAlreadyPaid is true
- Checkout.jsx: Blue banner shown on details screen alerting cashier "Delivery already paid — no additional fee" with address on file
- Checkout.jsx: Check fires when fulfillment toggles to 'delivery' OR when phone number is typed/changed while delivery is selected
- Checkout.jsx: Pickup toggle resets deliveryAlreadyPaid state cleanly
### [2026-04-26]
- Checkout.jsx: Moved delivery double-charge guard into handleConfirmSale as a hard DB gate
- Checkout.jsx: Re-queries orders table by phone right before insert — UI state cannot override it
- Checkout.jsx: confirmedTotal replaces grandTotal in order insert and confirmation object
### [2026-04-26]
- Checkout.jsx: Patched delivery double-charge vulnerability — phone number is now required (UI + button gate) when fulfillment is delivery
- Checkout.jsx: Removed customerPhone.trim() guard from hard DB gate — check now always fires for any delivery order regardless of cashier input
- Checkout.jsx: Tightened phone matching from .includes() to .slice(-7) === digits for precise last-7-digit equality check