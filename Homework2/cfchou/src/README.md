# Spotify Music Trends Dashboard
This project presents an interactive dashboard for analyzing global Spotify music data from 2009 to 2025. 
The dashboard follows an Overview–Focus–Detail analytical workflow and supports exploratory analysis through responsive layouts and interactive tooltips.
# View 1 — Genre Evolution Over Time (Stacked Area)
This view visualizes the temporal distribution of the top 10 music genres using a stacked area chart.
Tracks associated with multiple genres are proportionally weighted to avoid over-counting.
## Design rationale
Stacked area charts effectively convey changes in composition and aggregate volume over time, enabling users to identify long-term genre trends and shifts in dominance.
## Analytical purpose
To provide a high-level overview of how genre popularity evolves across years and to reveal macro-level temporal patterns before deeper exploration.
# View 2 — Popularity vs. Artist Scale (Scatter Tiles)
This view maps track popularity against artist follower counts (log scale), with color encoding track duration. Only the top 500 most popular tracks are shown to reduce visual clutter.
## Design rationale
A scatter-based representation supports multi-variable relationship analysis, while logarithmic scaling improves readability across large follower ranges. Color encoding enables an additional quantitative dimension without introducing extra axes.
## Analytical purpose
To explore whether popularity correlates with artist scale and to examine potential duration trends among highly popular tracks (e.g., whether recent popular songs tend to be shorter).
# View 3 — Popularity Distribution by Album Type (Boxplot)
This view summarizes popularity distributions across album types using boxplots with overlaid jittered points.
## Design rationale
Boxplots provide robust statistical summaries (median, interquartile range, and spread), while jittered points preserve visibility of underlying distributions and outliers.
## Analytical purpose
To compare variability and central tendency of popularity across release formats and assess structural differences between albums, singles, and compilations.