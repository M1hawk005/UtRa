# Usage Examples <a id="usage-title"></a>

Some of the core functions of the `brahe` library are illustrated here.

## Table of Contents <a id="table-of-contents"></a>

- [Basic Operations](#basic-operations)
	- [Load an AT-HYG data file](#load-data-file)
	- [Get a star by AT-HYG catalog ID](#get-star-by-id)
	- [Get data for a star](#get-star-data)
	- [Look up a star by name or designation](#get-star-by-name)
- [Positions and Velocities](#positions-and-velocities)
	- [Get position of one star as seen from another](#position-from-new-point)
	- [Get data for a star as seen from another](#properties-of-new-point)
	- [Account for time since epoch](#time-since-epoch)
- [Lists of Stars](#lists-of-stars)
	- [Getting AT-HYG stars as seen from any star in the catalog](#getting-lists)
	- [Working with lists](#working-with-lists)
- [Miscellany](#miscellany)


<a id="basic-operations"></a>

## Basic Operations

`brahe` defines a Star type for data read from AT-HYG. This Star object contains most of the "intrinsic" properties of a star, such as its absolute magnitude, its current position in space (relative to the Sun), and its velocity in each component of the position. 

Properties that depend on the star's location, such as its apparent brightness, are not stored. `brahe` provides functions to calculate those properties as needed.

<a id="load-data-file"></a>

### Load an AT-HYG data file

The main function for this is `brahe.ReadAthygData`. This function creates a list of Star objects from data in a CSV file. In order to work properly with `brahe.GetStarByID` (see below), the file should be sorted in order of the AT-HYG ID value.

```
	var t1 time.Time
	var t2 time.Duration

	t1 = time.Now()
	fileName := "./data/athyg_23_reduced_m10.csv"
	athygStars, err := brahe.ReadAthygData(fileName)
	if err != nil {
		panic(err)
	}
	t2 = time.Since(t1)
	fmt.Printf("Loaded %d stars from %v in time %s.\n", len(athygStars), fileName, t2)
```

Example result:

```
Loaded 330340 stars from ./data/athyg_23_reduced_m10.csv in time 700.484916ms.
```
[Back to Table of Contents](#usage-title)

<a id="get-star-by-id"></a>

### Get a star by AT-HYG catalog ID

`brahe.GetStarByID` gets a star from a list of stars prepared by `ReadAthygData`. The function does a binary search on the primary "ID" value for each one, so a sorted list of stars is required. All files currently available from the AT-HYG repository are already sorted in this manner.

```
	athygID := 246055
	testStar := brahe.GetStarByID(athygStars, athygID)
	fmt.Printf("Test star is %v.\n", testStar.Name)
```

Result: 

```
Test star is 82 G. Eri (HR 1008).
```

[Back to Table of Contents](#usage-title)

<a id="get-star-data"></a>

### Get data for a star

As noted above, the Star type defines a number of properties for data that is readable from AT-HYG, such as absolute brightness and catalog IDs. For properties of a star that are not intrinsic, such as apparent magnitude, `brahe` provides a few functions that accept a Star object and return the relevant values, based on its current position. By default, these properties are computed for the star as seen from the Sun.

```
	position := testStar.Position
	distance := brahe.Distance(*testStar)
	absMag := testStar.AbsoluteMag
	appMag := brahe.ApparentMagnitude(*testStar)

	fmt.Printf("%v has position of %.3f, distance from Sun of %.3f parsecs, absolute magnitude %v,\nand apparent magnitude %.3f as seen from the Sun.\n",
		testStar.Name,
		position,
		distance,
		absMag,
		appMag)
```

Result:

```
82 G. Eri (HR 1008) has position of [2.839 3.381 -4.127], distance from Sun of 6.043 parsecs, absolute magnitude 5.354,
and apparent magnitude 4.260 as seen from the Sun.
```
[Back to Table of Contents](#usage-title)

<a id="get-star-by-name"></a>

### Look up a star by name or designation

`brahe.CreateAthygIndex` creates a star name-to-ID index from the list of AT-HYG stars supplied. The main names supported by this lookup are:

- common names, such as "Polaris" or "Sirius"
- Bayer (Greek letter) and Flamsteed (numeric) designations: for these, the constellation name portion can be either the full name ("Centaurus"), the Latin genitive form ("Centauri"), or the 3-letter abbreviation ("Cen"). Greek letter names can be the Latinized name (e.g. "Alpha") or the Unicode character for the Greek letter.
- HIPPARCOS IDs ("HIP" + number)
- Harvard Revised/Yale Bright Star IDs ("HR" + number)
- Tycho-2 IDs ("TYC" + full ID, without leading zeros)
- Gaia IDs (just the number). The data release for the IDs will depend on the version of AT-HYG used; versions through AT-HYG 3.x use Gaia DR3 IDs.

Once the index is created, you can use `brahe.GetAthygStarByName` to use the index to look up a specific name or designation and get the correct Star object for it. It uses `brahe.GetStarByID` under the hood, so also requires a list sorted on the AT-HYG ID.

```
	athygIndex := brahe.CreateAthygIndex(athygStars)
	testStar2 := brahe.GetAthygStarByName(athygStars, athygIndex, "alpha Ori")
	fmt.Printf("Test lookup has AT-HYG ID %v and name %v.\n", testStar2.ID, testStar2.Name)
```

Result:

```
Test lookup has AT-HYG ID 463434 and name Betelgeuse (α Ori).
```
[Back to Table of Contents](#usage-title)

<a id="positions-and-velocities"></a>

## Positions and Velocities

`brahe` uses the `gonum` library's `floats` package for vector calculations under the hood. `floats` modifies most data in place. As a result, most operations that change star data operate on a copy of the star object, to avoid clobbering the original data from file load.

<a id="position-from-new-point"></a>

### Get position of one star as seen from another

The `brahe.TranslateStar` function translates the position and velocity components of a given star to the values they would have from another star. It also accepts a `time` parameter to account for stars' motions over time. The positions for AT-HYG stars are for J2000.0.

```
	name1 := "Sirius"
	name2 := "Procyon"

	star1 := brahe.GetAthygStarByName(athygStars, athygIndex, name1)
	star2 := brahe.GetAthygStarByName(athygStars, athygIndex, name2)
	fmt.Printf("Star 1 is %v with position %v, and star 2 is %v with position %v.\n", star1.Name, star1.Position, star2.Name, star2.Position)

	time := 0.0
	star3 := brahe.TranslateStar(*star1, *star2, time)
	fmt.Printf("%v has position [%.3f %.3f %.3f] seen from %v.\n",
		name1, star3.Position[0], star3.Position[1], star3.Position[2], name2)

```

Result:

```
Star 1 is Sirius (α CMa) with position [-0.494 2.477 -0.758], and star 2 is Procyon (α CMi) with position [-1.469 3.176 0.32].
Sirius has position [0.975 -0.699 -1.078] seen from Procyon.

```
[Back to Table of Contents](#usage-title)

<a id="properties-of-new-point"></a>

### Get data for a star as seen from another

Whenever a star is translated to a different location, the Star type attributes and associated `brahe` functions work in the same way as they do with the original
Star object. Derived or calculated values apply to the new location.

```
	position = star3.Position
	distance = brahe.Distance(star3)
	absMag = star3.AbsoluteMag
	appMag = brahe.ApparentMagnitude(star3)

	fmt.Printf("%v has position of %.3f, distance from %v of %.3f parsecs, absolute magnitude %v,\nand apparent magnitude %.3f as seen from %v.\n",
		star3.Name,
		position,
		star2.Name,
		distance,
		absMag,
		appMag,
		star2.Name)
```
Result:

```
Sirius (α CMa) has position of [0.975 -0.699 -1.078], distance from Procyon of 1.613 parsecs, absolute magnitude 1.454,
and apparent magnitude -2.508 as seen from Procyon (α CMi).
```
[Back to Table of Contents](#usage-title)

<a id="time-since-epoch"></a>

### Account for time since epoch

As noted above, `brahe.TranslateStar` accepts a `time` parameter to account for stars' motions over time.

```
	time = 10000.0
	star4 := brahe.TranslateStar(*star1, *star2, time)
	fmt.Printf("In %v years, %v has position [%.3f %.3f %.3f] seen from %v.\n",
		time, name1, star4.Position[0], star4.Position[1], star4.Position[2], name2)
```

Result:

```
In 10000 years, Sirius has position [0.949 -0.849 -1.021] seen from Procyon.
```
[Back to Table of Contents](#usage-title)

<a id="lists-of-stars"></a>

## Lists of Stars

<a id="getting-lists"></a>

### Getting AT-HYG stars as seen from any star in the catalog

The `brahe.GetViewToTargetStar` function accepts a list of AT-HYG stars as well as a "list configuration", which is a set of filters for the list, and returns a filtered list of Star objects from the main list. `GetViewToTargetStar` can also take advantage of concurrency (via goroutines) when desired.

Here is how you would get a list of all the stars visible to the naked eye from Altair (alpha Aquilae), about 16 light years from the sun.

```
	// get a list of stars as seen from Altair, looking in the general direction of Vega
	star1 = brahe.GetAthygStarByName(athygStars, athygIndex, "Altair")
	star2 = brahe.GetAthygStarByName(athygStars, athygIndex, "Vega")

	listConfig := brahe.StarListConfig{
		*star1,  // the star you are "at"
		*star2,  // the one you are looking towards
		math.Pi, // maximum angular separation between star2 (here, Vega) and allowed stars. This is in radians; pi radians = 180 degrees, so the entire sky is in range.
		6.5,     // maximum (dimmest) allowed magnitude: 6.5 gets most naked-eye stars as seen from Altair
		0.0,     // no time before or after current epoch = positions in 2000
	}

	// the last two arguments control concurrency; the values 1, 0 indicate a single nonconcurrent process
	fromAltair := brahe.GetViewToTargetStar(athygStars, listConfig, 1, 0) 
	fmt.Println(len(fromAltair), "star(s) found.")
```

Result:

```
8875 star(s) found.
```
If you changed the angular parameter from `math.Pi` to something smaller, you'd have a smaller selection of stars, more tightly concentrated around the direction of Vega. This would be appropriate for generating a star chart for a small area of the sky.

[Back to Table of Contents](#usage-title)

<a id="working-with-lists"></a>

### Working with lists

Having gotten the filtered list, it's possible to do things like get the stars in order of distance, apparent brightness, or any other parameter of interest.

```
	// sort the list by distance
	sort.Slice(fromAltair, func(i, j int) bool {
		return brahe.Distance(fromAltair[i]) < brahe.Distance(fromAltair[j])
	})

	// print the closest 10 stars
	fmt.Printf("Nearest naked-eye stars seen from %v:\n", star1.Name)
	for i := 0; i < 10; i++ {
		current := fromAltair[i]
		fmt.Printf("Star %v = %v, with a magnitude of %.3f and distance of %.3f parsecs.\n",
			i+1,
			current.Name,
			brahe.ApparentMagnitude(current),
			brahe.Distance(current))
	}

	// sort the list by brightness
	sort.Slice(fromAltair, func(i, j int) bool {
		return brahe.ApparentMagnitude(fromAltair[i]) < brahe.ApparentMagnitude(fromAltair[j])
	})

	// print the brightest 10 stars
	fmt.Printf("\nBrightest stars seen from %v:\n", star1.Name)
	for i := 0; i < 10; i++ {
		current := fromAltair[i]
		fmt.Printf("Star %v = %v, with a magnitude of %.3f and distance of %.3f parsecs.\n",
			i+1,
			current.Name,
			brahe.ApparentMagnitude(current),
			brahe.Distance(current))
	}
```

Result:

```
Nearest naked-eye stars seen from Altair (α Aql):
Star 1 = Gl 752A (HIP 94761), with a magnitude of 5.621 and distance of 1.181 parsecs.
Star 2 = 70 Oph (HR 6752), with a magnitude of 2.382 and distance of 2.380 parsecs.
Star 3 = 61 Cyg (HR 8085), with a magnitude of 4.860 and distance of 2.990 parsecs.
Star 4 = 61 Cyg (HR 8086), with a magnitude of 5.711 and distance of 2.990 parsecs.
Star 5 = HR 7703 (Gl 783A), with a magnitude of 4.623 and distance of 4.361 parsecs.
Star 6 = Vega (α Lyr), with a magnitude of -1.137 and distance of 4.485 parsecs.
Star 7 = Gl 673 (HIP 85295), with a magnitude of 6.477 and distance of 4.728 parsecs.
Star 8 = Gl 664 (HIP 84478), with a magnitude of 5.897 and distance of 4.878 parsecs.
Star 9 = Guniibuu (36 Oph), with a magnitude of 3.905 and distance of 4.893 parsecs.
Star 10 = μ Her (86 Her), with a magnitude of 2.334 and distance of 5.040 parsecs.

Brightest stars seen from Altair (α Aql):
Star 1 = Vega (α Lyr), with a magnitude of -1.137 and distance of 4.485 parsecs.
Star 2 = Canopus (α Car), with a magnitude of -0.540 and distance of 98.341 parsecs.
Star 3 = Arcturus (α Boo), with a magnitude of 0.023 and distance of 11.640 parsecs.
Star 4 = Rigel (β Ori), with a magnitude of 0.212 and distance of 268.577 parsecs.
Star 5 = Achernar (α Eri), with a magnitude of 0.491 and distance of 43.563 parsecs.
Star 6 = Capella (α Aur), with a magnitude of 0.510 and distance of 15.996 parsecs.
Star 7 = Betelgeuse (α Ori), with a magnitude of 0.510 and distance of 156.994 parsecs.
Star 8 = Hadar (β Cen), with a magnitude of 0.622 and distance of 120.845 parsecs.
Star 9 = Acrux (α-1 Cru), with a magnitude of 0.806 and distance of 100.365 parsecs.
Star 10 = Fomalhaut (α PsA), with a magnitude of 0.874 and distance of 6.720 parsecs.

```

[Back to Table of Contents](#usage-title)

<a id="miscellany"></a>

## Miscellany

`brahe` is mostly designed to read and process the AT-HYG catalog, but you can access some common calculations and data directly. In particular, most computations needed to convert data from AT-HYG into forms suitable for reports or star charts are available for direct use.

The file `utils.go` contains the various astronomy calculations, as well as some common vector math operations not provided by `gonum`. 

The file `constellations.go` provides the basic constellation data shown here.

```
	// Basic astronomical calculations
	pc := 1.302
	fmt.Printf("%v parsecs is %.3f light years.\n", pc, brahe.ParsecsToLightYears(pc))
	absmag := 4.379
	fmt.Printf("Absolute magnitude of %v = %.3fx Solar luminosity.\n", 
		absmag, 
		brahe.AbsMagToLuminosity(absmag))

	// Basic constellation data
	con := "UMa"
	fmt.Printf("The full name of %v is %v and the Latin genitive form is %v.\n",
		con,
		brahe.GetNameForConstellation(con),
		brahe.GetGenitiveForConstellation(con))

```

Result:

```
1.302 parsecs is 4.247 light years.
Absolute magnitude of 4.379 = 1.543x Solar luminosity.
The full name of UMa is Ursa Major and the Latin genitive form is Ursae Majoris.

```
[Back to Table of Contents](#usage-title)