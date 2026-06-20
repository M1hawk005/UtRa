# Augmented Tycho - HYG (AT-HYG)

## About This Repository

This data set (the Augmented Tycho - HYG star catalog) is a combination of data from everal major star catalogs:

    - Tycho-2, compiled by the Hipparcos mission
    - Gaia Data Release 3
    - The Hipparcos Catalog
    - The Yale Bright Star Catalog
    - The Gliese-Jahreiss Catalog
    - Star names from the IAU's official list of names.

It contains over 2.5 million stars, the large majority having accurate distance and belocity measurements from the Gaia mission, as well as historical information from the HYG catalog.

This repository was, until recently, hosted on Github. The version hosted here contains the most recent version of each relevant file from the Github original. Since there have historically been some _very_ large files hosted there, but most represented early or obsolete versions of the database, this repository represents a "clean start" with only 1 major (and very carefully updated only when needed) set of data files. The version hosted on Github contains the detailed history, but is no longer being maintained.

## Rationale

HIPPARCOS (and thus HYG) is getting a little dated, while Gaia (its ultimate replacement for many purposes) is absolutely gigantic -- 1.3 billion records -- and too large for many general-purpose applications. For this update, I wanted to accomplish the following:

1. Incorporate Gaia results into the old but popular HYG dataset.
2. Use a well-defined modern star catalog as a primary basis for IDs, rather than the somewhat _ad hoc_ system in HYG.
3. Create a larger database than HYG that is suitable for today's faster systems, but still small enough to be manageable in many applications.

I chose the Tycho-2 catalog for this purpose. The Tycho-2 catalog's size (~2.5M records) and coverage (essentially complete to V = 11, mostly complete to V = 11.5) makes it suitable for many current applications. It's large enough to be comprehensive for all but the deepest charts, but small enough to be manageable in fairly simple applications. 

Tycho-2 (released in 2000) is only slightly younger than HIPPARCOS, so the idea was to combine it with the newer Gaia DR3 results (2020-2022) whenever feasible. This gives high-quality distance information for over 2M stars instead of the lower-precision results from HIPPARCOS for 0.1M. Adding Gaia results to Tycho-2 gives an "Augmented" Tycho-2 dataset (AT), which is the basis for most stars in the new catalog.

By merging AT with HYG, the "classical" IDs and names for a large number of Tycho / Gaia stars are also available. The result is AT-HYG. 

## License


This work is licensed under a
[Creative Commons Attribution-ShareAlike 4.0 International License][cc-by-sa].

[cc-by-sa]: http://creativecommons.org/licenses/by-sa/4.0/

This license applies to versions v3.0 and later. Older versions (prior to v3.0) are licensed under CC BY-SA 2.5.

## Download Format

### Full Catalog (version 3.3 - data/athyg_v33-*.csv)

The full catalog has been split into 2 components, which should be downloaded, uncompressed, and concatenated, e.g. (Linux command for version 3.3):

`cat athyg_v33-1.csv athyg_v33-2.csv > athyg_v33.csv`

The full CSV can then be imported into the database tool of your choosing.

### Subset files (version 3.3 - data/subsets)

Several smaller subset files are available if the full catalog is still too large. One of these, the "HYGLike" subset, is designed to have a similar schema to the HYG Database and be a drop-in replacement for it in many applications. The other subset files are simple extracts from the main AT-HYG that have a lower (brighter) magnitude cutoff for most stars.

See data/subsets/README.md for more details about these files.

## Current Version: 

The current version of AT-HYG is version v3.3 (data/athyg_v33-*.csv.gz). 

### Changes from version 3.2 to 3.3

The update for v3.3 adds 34 new proper names for stars that correspond directly to 11 new proper names in HYG v4.2, specifically to newly added (May 2024 to June, 2025) names approved by the IAU. No other data (in particular, no astrometric or other physical data) has been changed.

### Comparison to HYG

The HYG catalog lists proper motions and radial velocities in the same units as AT-HYG (milliarcsec/year and km/sec respectively), but has the Cartesian velocities vx, vy, and vz in parsecs per year. AT-HYG uses kilometers per second, in part to reduce the space needed for figures in CSV format (the figures in pc/year have 5 or 6 leading zeroes) and in part to make direct comparisons to the radial velocity simple. The conversion factor for converting km/sec to pc/year is 1 km/sec = 1.02269 E-6 pc/year.

Apart from the difference in units for vx, vy, and vz, and a few slightly different field names, AT-HYG 3.3 is almost a drop-in replacement for HYG 3.x or HYG 4.x for many applications -- in particular, for any application that needs only the stars' catalog IDs, historical IDs (like Henry Draper or traditional names), magnitudes, positions, and velocities. The fields missing from AT-HYG that are present in HYG are:

* Variable star IDs and approximate magnitude ranges
* Explicit identification of components in multiple stars (in terms of a "base ID" representing the primary and a component ID)

## Other Versions:

See version-info.md for more details on previous versions of the catalog.