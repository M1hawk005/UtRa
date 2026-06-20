## Freely Anticipated Questions (FAQ)

`uraniborg` is new, so these questions haven't been asked, frequently or otherwise, but they are ones that I freely anticipate will come up eventually.

### Operation and Configuration

#### Q: Can I enter Unicode Greek letters directly in a star name, like "α UMa"?

A: Yes. Both the Latinized English names and the official Unicode (lowercase) Greek characters are supported.

#### Q: How do I enter superscripted numbers for Bayer designations, like π³ Ori or α² Lib?

A: Use a hyphen plus the number following the Greek letter name. For example:

- π³ Ori: "pi-3 Ori" or "π-3 Ori"
- α² Lib: "alpha-2 Lib" or "α-2 Lib"

This follows the format used in the original HYG catalog and continued in AT-HYG.

`uraniborg` will automatically also look for the "¹" superscripted ID when given a plain (no number) Bayer Greek letter ID. That is, if you ask for the "alpha" star in a constellation, it will look for both "α" or "α¹" and return whichever one it finds. This is useful for some bright stars that are doubles, and which officially have a superscript number, but are not always referred to with one, such as alpha Centauri.

### Data Sources

#### Q: What type of data file does `uraniborg` accept?

A: It currently accepts CSV files (with a `.csv` extension) that conform to the schema used by the [AT-HYG database](https://codeberg.org/astronexus/athyg/), version 2.2 or later. The included sample data set (`athyg_v32_subset.csv`) is an example of that format + schema. 

The first row of the CSV is expected to be headers (column names). `uraniborg` does not currently use the names, but the row must exist. Additionally, the order of the columns must match the order of the ones in the included data file. All downloadable data files from the [AT-HYG database repository](https://codeberg.org/astronexus/athyg/) are already in the needed format.

#### Q: How do I add another data source to `uraniborg`?

1. Download the data source to the `data` directory.
2. Uncompress it if it is not already uncompressed. 
3. In the file `config/application.yaml`, change the `datafile` configuration item to the name of the file minus the .csv extension. 

Example: for a data file called `uraniborg_example.csv`, change the configuration to read:

```
datafile: uraniborg_example
```
Then stop and restart `uraniborg`.

#### Q: Can you use the HYG Catalog with `uraniborg`?

A: The schemas for HYG and AT-HYG are enough different that `uraniborg` can't directly read HYG files. However, there is a subset of AT-HYG that contains all the stars in AT-HYG that had data from HYG. The current version of this catalog subset is [available from Codeberg](https://codeberg.org/astronexus/athyg/src/branch/main/data/subsets/athyg_32_hyg_ids.csv.gz). It contains 118,971 stars and is effectively the HYG catalog in AT-HYG format; it works out of the box in `uraniborg`.

#### Q: What other data sources are publicly available right now?

The [AT-HYG repository](https://codeberg.org/astronexus/athyg/) has the largest collection. In addition to the HYG-specific subset described above, here are some other examples that you may wish to try:

- The full AT-HYG catalog of over 2.5 million stars. This is very large and is saved in two separate files; see [the AT-HYG repository documentation](https://codeberg.org/astronexus/athyg/) for more.

- The AT-HYG catalog [limited to magnitude +11.0 or brighter](https://codeberg.org/astronexus/athyg/src/branch/main/data/subsets/athyg_32_reduced_m11.csv.gz). This is similar to the sample data set included with `uraniborg` but with stars up to 1 magnitude fainter. It contains about 35% of the entire AT-HYG catalog (871553 stars).

- The ["Classic IDs" subset of AT-HYG](https://codeberg.org/astronexus/athyg/src/branch/main/data/subsets/athyg_32_classic_ids.csv.gz). This contains every star in AT-HYG that has a proper name or an ID in any of these major catalogs: Henry Draper, HIPPARCOS, Gliese-Jahreiss, or the Yale Bright Star Catalog. It is similar in size to the included sample data set, but excludes a few stars that have only a Tycho-2 or Gaia DR3 ID.

#### Q: What is your plan to keep up with changing data sources? Will Gaia itself (or a suitable subset) be a primary data source in the future?

A: Gaia DR3 is much too large (over 1 billion stars) for a simple CLI app like this one.

The road map for data sources in `uraniborg` is basically that for Augmented Tycho + HYG (AT-HYG), which in turn only contains stars that are either in the Tycho-2 catalog or in the HYG catalog. Since the vast majority of HYG stars are also in Tycho-2, in effect, the scope of data source management remains "Tycho-2 plus a few others," which are then augmented with Gaia data whenever possible. In particular, one planned update is that when the Gaia project issues Data Release 4 in the next year or two, it'll replace DR3 for all the Gaia-sourced data in AT-HYG -- but I won't be adding any new stars unless I find ones omitted by mistake. 

I have found that the size of Tycho-2 (2.5M stars) works well for `uraniborg` and so I have no specific plans to add more data. One reason for this is that, even though a catalog 2x or even 3x the size of Tycho-2 would work fine with `uraniborg`, there are relatively few general-purpose (complete or nearly so to a given magnitude) star catalogs that have a size between Tycho-2 and much larger catalogs like UCAC-4 and UCAC-5, with more than 100 million stars. So it's unlikely I will use another base catalog besides Tycho-2 in the foreseeable future.

Having said all that, any data source that follows the same schema as AT-HYG 2.2 or later will work "out of the box" in `uraniborg`, so a Gaia-only source you create with the same field names, and as many usable values for positions and velocities as possible, would be a valid data source in `uraniborg`.

### Other Miscellany

#### Q: What's the best way to view the charts that `uraniborg` produces?

A: I've found it useful to view them with any file viewer that automatically updates the file display whenever the chart output file changes. I personally have used VSCodium and Sublime Text for this purpose; they both can show .png files and will automatically update the view when the file gets recreated by `uraniborg`. 

#### Q: Is any image format besides PNG available for `uraniborg` charts?

A: `uraniborg` supports exports to JPEG. This is enabled by the user configuration field `imageformat`. To enable JPEG exports, set `imageformat` equal to `jpeg` or `jpg`. The only difference between these two values is the file extension used to save the output JPEG file.

JPEG files take significantly less time to create, but are of somewhat lower quality than PNG, even at maximum quality (`uraniborg` uses the highest available JPEG quality automatically). JPEG images are most useful if you're using a tool like `uranimator` to create videos from `uraniborg` output.

Currently no other image formats besides PNG and JPEG are available. Any value of `imageformat` other than the JPEG options will be ignored and `uraniborg` will create PNG files.

#### Q: Why a CLI app? Why not a web-based app like the one you worked on before (Endeavour)?

A: Because it's a lot simpler under the hood, both to develop and to get good performance with.

The oldest versions of the HTML/Javascript app that became Endeavour go back pretty far -- all the way back to the early 00s, in fact. Before about 2012, the images for that application actually _were_ static .GIF or .PNG files, like the ones generated by `uraniborg`, just overlaid with some JavaScript to pop up star details when a user moused over a star symbol. 

The rewrite that became Endeavour in 2012-2014, to switch to a pure HTML5 canvas approach, was state of the art at the time -- meaning "vanilla JavaScript with jQuery for the trickier bits." I knew that I wanted to do two things with it eventually: (1) incorporate a large amount of Gaia distance and velocity data into the catalogs used by Endeavour, and (2) rewrite it in a more modern framework (originally in React.js, then when the React.js ecosystem got too bloated for a smallish app like this one, in something else to be determined). 

Both activities ended up looking more complex and time-consuming than I originally anticipated, and for various reasons I decided not to focus on either of them for a while. In particular, the backend for Endeavour relies on a conventional relational database for all the star data; this was, and is, fine for "static" star positions like the ones in Tycho-2 and the UCAC-4 catalog, but problematic for more than a fairly small number of 3D star position calculations. The architecture for the web application's 3D star position calculations was adequate -- but really only just -- for the HIPPARCOS catalog. It was not suitable for something the size of Tycho-2, or a reasonable subset of Gaia, without a major rewrite that I didn't feel like doing.

Once I expanded HYG to AT-HYG using Tycho-2 and Gaia data in 2023, I decided to leave Endeavour where it was and take a different approach to working with Gaia-sourced data sets.

#### Q: What other features are you thinking of adding to later versions?

A: I'm still undecided. This is a personal project that I've opened up to the outside world mostly because I think some other people might like it. The most likely change would be to make it even easier to create chart updates as well as to save series of charts in a single run (not just overwrite the previous one). I don't anticipate adding large new numbers of chart options or to significantly change the available data sources. Of course, this being open source, you can do whatever you like with it on those fronts.

#### Q: Uraniborg doesn't have as many 'star atlas' features, like deep-sky objects, compared to Endeavour or other 'star atlas' type applications like Stellarium. Is this by design?

A: This is a conscious design decision. 

The focus of `uraniborg` was to make it relatively easy to view the vast majority of Tycho-2 stars from any other Tycho-2 star (about 2.5 million) with much higher accuracy than was available just a few years ago (especially prior to Gaia DR2 and DR3). Although Endeavour could show stars from Tycho-2, it didn't have any distance information for them, so its "remote viewing" capability was limited to stars in HIPPARCOS and the Gliese catalog. Endeavour was also a bit of a "test bed" for interactive features like grabbing Digital Sky Survey images for deep-sky objects on the fly and showing them when someone selected a DSO on the chart. 
As a result, star atlas features appropriate for near-Earth views and for Endeavour, like constellation boundaries and most deep-sky objects, didn't make as much sense to pursue in `uraniborg`. 