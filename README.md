# Investor Homebase

A Zillow-like, full-stack real estate search and investment analysis tool built for investors. It runs locally, uses free public U.S. data sources, and is structured for easy deployment later.

## Features
- Search U.S. properties by city, ZIP, address, or keyword
- Zillow-style property cards with pricing, beds/baths, square footage, and images (placeholders when unavailable)
- Property detail page with underwriting, strategy recommendations, and grading
- Interactive map view (Leaflet + OpenStreetMap tiles)
- Investment analysis engine with adjustable assumptions

## Tech Stack
- Frontend: Next.js (React)
- Backend: Next.js API routes (Node.js)
- Database: SQLite (local)
- Mapping: Leaflet + OpenStreetMap tiles

## Data Sources (Free)
This app intentionally uses **free, public U.S. datasets**. The default ingest pipeline pulls:

- **Connecticut Real Estate Sales (OPM)** — statewide property sales transactions with address, sale price, sale date, and property type.
- **NYC Rolling Sales (Department of Finance)** — property sales transactions with address, sale price, and building class.
- **Philadelphia Real Estate Transfers (Department of Records)** — real estate transfer records via Carto SQL API.
- **Cook County Property Sales (IL)** — public sales records for Cook County via Socrata.
- **Iowa City Sales (Assessor)** — Iowa City assessor sales records.
- **Pottawattamie County Assessor Sales (IA)** — county assessor sale records.
- **U.S. Census Geocoder** — free geocoding service used to get latitude/longitude from addresses.
- **OpenStreetMap tiles** — free map tiles for the interactive map.

These sources are free but not a real-time MLS feed. The dataset represents actual transactions, and the app labels these as public records rather than live listings. See the limitations section for details.

## Getting Started

### 1) Install dependencies
```bash
npm install
```

### 2) Load the public dataset into SQLite
```bash
npm run ingest
```

You can adjust the ingestion size and geocoding behavior:

```bash
# Limit to 1000 records and skip geocoding
INGEST_LIMIT=1000 GEOCODE=0 npm run ingest
```

### 3) Run locally
```bash
npm run dev
```

Open `http://localhost:3000`.

## Environment Variables
Optional overrides:

- `DATABASE_PATH` - SQLite file path (default: `./data/realestate.sqlite`)
- `INGEST_LIMIT` - Number of records to ingest (default: `2000`)
- `GEOCODE` - Set to `0` to skip geocoding
- `SODA_APP_TOKEN` - Optional Socrata app token (free) for higher API limits
- `RAPIDAPI_KEY` - RapidAPI key for ZipMarketData property estimate endpoint
- `RAPIDAPI_HOST` - Override RapidAPI host (default: `real-estate-market-data.p.rapidapi.com`)

## Financial Formulas
The app uses straightforward investor underwriting math. All inputs are editable on the property detail page.

### Rent
- **Monthly Rent (est.)** = `price * rentRatio`
- **Annual Rent** = `monthlyRent * 12`

### Expenses (annual)
- **Taxes** = `price * taxRate`
- **Insurance** = `price * insuranceRate`
- **Maintenance** = `price * maintenanceRate`
- **Vacancy** = `annualRent * vacancyRate`
- **Management (optional)** = `annualRent * managementRate`

### NOI
- **NOI** = `annualRent - (taxes + insurance + maintenance + vacancy + management)`

### Financing
- **Loan Amount** = `price * (1 - downPaymentPct)`
- **Monthly Mortgage** = standard amortization formula

### Cash Flow
- **Monthly Cash Flow** = `monthlyRent - monthlyMortgage - (annualExpenses / 12)`
- **Annual Cash Flow** = `monthlyCashFlow * 12`

### Returns
- **Cap Rate** = `NOI / price`
- **Cash-on-Cash** = `annualCashFlow / totalCashInvested`
- **IRR** = computed from annual cash flows + sale proceeds at the hold period
- **Break-even Occupancy** = `(annualExpenses + debtService) / annualRent`

### Rehab and ARV
- Rehab cost = `sqft * costPerSqft` (light/moderate/heavy ranges)
- ARV = `price * (1 + arvPremium) + rehabCost * 0.6`

## Strategy Recommendations
The strategy engine scores each property and recommends:
- **BRRRR** (based on refinance potential + cash flow)
- **House Hacking** (based on beds and occupancy breakeven)
- **Buy-and-Hold** (cap rate + cash-on-cash)
- **Fix-and-Flip** (ARV vs. total cost)

Each recommendation includes estimated metrics and reasoning.

## Tests
Run financial calculation tests:

```bash
npm run test
```

## Limitations & Next Steps
- This app uses public transaction data, not live MLS listings.
- Beds, baths, and square footage are estimated when unavailable.
- Extend the ingest pipeline to include more state or county datasets.

## Deployment Readiness
- Environment-variable driven config
- SQLite for local use (swap with Postgres for production)
- Next.js structure ready for Vercel, AWS, or similar

---

If you want, I can add additional datasets (other states), replace the data layer, or wire in a user-provided API key for richer listing data.
