The file "athyg_32_hr.csv" contains an extremely reduced version of the AT-HYG v3.2 catalog 
(9019 stars, 0.35% of the full catalog). It contains all AT-HYG stars with an HR (Harvard Revised) ID,
which includes all the stars in the Yale Bright Star Catalog. The Sun is also included.

The file "athyg_v32-faulty.csv" is an intentionally very short and also faulty file to test some validity/formatting checks. 
All of these checks currently display a warning to the terminal as uraniborg runs, but do not force file processing to stop.

    - Sirius is missing its right ascension and XYZ coordinates, so its computed Y coordinate should be set to zero.
    - Procyon is missing its declination and XYZ coordinates, so its computed Z coordinate should be set to zero.
    - Spica is missing its apparent magnitude and XYZ coordinates, so it should get a placeholder absolute magnitude.
    - Antares is missing its coordinates and its absolute magnitude, so it should get a placeholder apparent magnitude.
    - Fomalhaut has a bad AT-HYG ID.

This means 5 records are faulty. Unit testing should correctly assess the number of faulty records.
