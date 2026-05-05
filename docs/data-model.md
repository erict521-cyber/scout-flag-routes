# Scout Flag Routes Data Model Draft

This file defines the working Google Sheet structure for the later Sheets phase.

## Sheets

### `settings`
| Field | Purpose |
| --- | --- |
| troop_name | Display name for troop workspace |
| coordinator_email | Coordinator account that created/owns the sheet |
| created_at | Workspace creation timestamp |
| schema_version | Migration/version tracking |

### `customers`
| Field | Purpose |
| --- | --- |
| customer_id | Stable app/customer key |
| order_id | TroopWebHost order ID if available |
| customer_name | Customer display name |
| address | Full service address |
| lat | Cached latitude |
| lng | Cached longitude |
| instructions | Special instructions |
| email | Optional future notification field |
| phone | Optional future notification field |
| notify_email_opt_in | Future parked feature |
| notify_text_opt_in | Future parked feature |
| active | Allows soft deletion |

### `routes`
| Field | Purpose |
| --- | --- |
| route_id | Route key |
| route_name | Human label |
| driver_name | Entered by route crew |
| navigator_name | Entered by route crew |
| assigned_at | Assignment timestamp |
| locked | Used to warn if already assigned |

### `route_stops`
| Field | Purpose |
| --- | --- |
| route_stop_id | Stable key |
| route_id | Route assignment |
| customer_id | Customer key |
| stop_order | Order inside route |
| posted | Morning posted status |
| posted_at | Morning timestamp |
| picked_up | Evening pickup status |
| picked_up_at | Evening timestamp |
| comment | Issue/comment log |
