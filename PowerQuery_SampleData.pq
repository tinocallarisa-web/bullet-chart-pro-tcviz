// ══════════════════════════════════════════════════════════════════════
//  Bullet Chart Pro — Sample Data (Power Query M)
//  Uso: Power BI Desktop → Home → Transform Data →
//       Home → New Source → Blank Query → Advanced Editor → pegar esto
// ══════════════════════════════════════════════════════════════════════

let
    // ── Regional Sales ────────────────────────────────────────────────
    Regional_Sales = #table(
        type table [
            Category = text,
            Actual   = number,
            Target   = number,
            Forecast = number
        ],
        {
            { "North",   92500,   78000,  95000 },
            { "South",   61200,   80000,  70000 },
            { "East",    87300,   85000,  90000 },
            { "West",   105600,  100000, 108000 },
            { "Center",  44800,   60000,  52000 }
        }
    ),

    // ── Product Categories ────────────────────────────────────────────
    Product_KPIs = #table(
        type table [
            Category = text,
            Actual   = number,
            Target   = number,
            Forecast = number
        ],
        {
            { "Electronics",    1245000, 1100000, 1300000 },
            { "Apparel",         387500,  420000,  395000 },
            { "Food & Beverage", 892000,  900000,  920000 },
            { "Home & Garden",   234800,  200000,  245000 },
            { "Sports",          156300,  180000,  165000 },
            { "Automotive",      678900,  650000,  700000 },
            { "Toys",            112400,  150000,  125000 }
        }
    ),

    // ── Monthly Revenue (for Sparklines — Pro feature) ────────────────
    Monthly_Revenue = #table(
        type table [
            Month    = text,
            Actual   = number,
            Target   = number
        ],
        {
            { "Jan",  88000, 100000 },
            { "Feb",  91000, 100000 },
            { "Mar",  95000, 100000 },
            { "Apr",  98000, 100000 },
            { "May", 102000, 100000 },
            { "Jun", 107000, 100000 },
            { "Jul", 111000, 100000 },
            { "Aug", 115000, 100000 },
            { "Sep", 109000, 100000 },
            { "Oct", 118000, 100000 },
            { "Nov", 122000, 100000 },
            { "Dec", 130000, 100000 }
        }
    )

// ── Devuelve la tabla que quieras usar en el visual ────────────────────
//    Cambia "Regional_Sales" por "Product_KPIs" o "Monthly_Revenue"
in
    Regional_Sales
