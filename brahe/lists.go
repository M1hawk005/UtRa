package brahe

// lists.go: functions for creating and transforming lists of Star objects from AT-HYG

import (
	"math"

	"gonum.org/v1/gonum/floats"
)

/*
GetStarByID looks in a *sorted* list of Star objects [stars] and does a binary search to find the one matching the supplied ID [lookupID].
The sort has to be an ascending sort on the "ID" field/property.

It returns a reference to the Star object found, or a placeholder Star object with
no physically relevant data and an invalid ID if not found.
*/
func GetStarByID(stars []Star, lookupID int) *Star {
	var star = new(Star)
	star.ID = INVALID_OBJECT_ID

	steps := 0

	minValue := 0
	maxValue := len(stars)

	for {

		steps += 1
		if steps > MAX_BINARY_STEPS {
			break
		}

		r := maxValue - minValue
		r2 := r / 2
		i := minValue + r2
		resultID := (stars)[i].ID
		if lookupID == resultID {
			star = &stars[i]
			break
		} else if lookupID > resultID {
			minValue += r2
		} else if lookupID < resultID {
			maxValue -= r2
		}

	}
	return star
}

// GetAthygStarByName looks up the name or designation [name] in an index of star IDs to names [athygIndex] and finds the matching star in [athygStars].
// If a match is found, the full Star object is returned. Otherwise,
// an empty record with a placeholder ID is returned.
func GetAthygStarByName(athygStars []Star, athygIndex map[string]int, name string) *Star {
	var star = new(Star)
	star.ID = INVALID_OBJECT_ID
	id := AthygTargetIDLookup(athygIndex, name)
	if id > 0 {
		star = GetStarByID(athygStars, id)
	}
	return star
}

// TranslateStar creates a copy of [star1] with position and velocity values as seen from [star2],
// at a time [time] years before or after the epoch.
func TranslateStar(star1 Star, star2 Star, time float64) Star {
	updatedStar := CloneStar(star1)
	floats.Sub(updatedStar.Position, star2.Position)
	floats.Sub(updatedStar.Velocity, star2.Velocity)
	if time != 0.0 {
		floats.Add(updatedStar.Position, DistanceDelta(updatedStar, time))
	}
	return updatedStar
}

/*
SelfTranslateStar creates a copy of [star1] in the position it has [time] years before or after the chart epoch.

This is functionally equivalent to TranslateStar(star1, star2, time) when star2 represents the Sun, but simpler.
*/
func SelfTranslateStar(star Star, time float64) Star {
	translatedStar := CloneStar(star)

	if time != 0.0 {
		floats.Add(translatedStar.Position, DistanceDelta(translatedStar, time))
	}
	return translatedStar
}

// TranslateStarList translates a list of Star objects [list] by the specified vector [origin].
func TranslateStarList(list []Star, origin CartesianVector) {
	for i := 0; i < len(list); i++ {
		star := CloneStar((list)[i])
		floats.Sub(star.Position, origin)
		(list)[i] = star
	}
}

// StarPassesFilter compares the position of the star [star] to a given center / target vector [sightline] and to the minimum allowed brightness [minScaledLuminosity]
// for the data set. Angle comparison is via the minimum allowed cosine between the vectors [directionCosine].
func StarPassesFilter(star Star, sightline []float64, directionCosine float64, minScaledLuminosity float64) bool {
	passes := false

	if minScaledLuminosity > MIN_APPARENT_LUMINOSITY {
		d2 := floats.Norm(star.Position, 2.0)
		if star.Luminosity/(d2*d2) >= minScaledLuminosity {
			if DirectionCosine(star.Position, sightline) > directionCosine {
				passes = true
			}
		}
	} else {
		if DirectionCosine(star.Position, sightline) > directionCosine {
			d2 := floats.Norm(star.Position, 2.0)
			if star.Luminosity/(d2*d2) >= minScaledLuminosity {
				passes = true
			}
		}
	}
	return passes
}

/*
GetViewToTargetStar requests a list of Star objects meeting specific criteria as defined in listConfig, such as location in space, direction or object
looking towards, and the minimum allowed brightness (as seen from the location specified).

Under the hood, it invokes TranslateStarVectorListSubset. GetViewToTargetStar is *generally* the function you wish to use in an application using this module.

[concurrency] and [subset] enable concurrent computations. [concurrency] is the number of concurrent routines, and [subset] is the ID of
the subset being processed (from 0 to [concurrency]-1). Use 1 and 0 respectively for non-concurrent (single process) operation.
*/
func GetViewToTargetStar(list []Star, listConfig StarListConfig, concurrency int, subset int) []Star {
	source := CloneStar(listConfig.From)
	target := CloneStar(listConfig.To)
	newCenter := TranslateStar(target, source, listConfig.Time)
	return TranslateStarVectorListSubset(list, source, newCenter.Position, listConfig.Angle, listConfig.Magnitude, listConfig.Time, concurrency, subset)
}

/*
TranslateStarVectorListSubset takes a list of Star objects [list], and computes a subset of star objects that pass certain criteria.
The core criteria are: (1) positions are calculated with the star [viewpoint] at the center at a time [time]
years before (negative) or after (positive) the application epoch; (2) all valid positions are within [angle] radians from
the target vector [sightline], and (3) the calculated stars have an apparent magnitude brighter than [magnitude].

Computational concurrency level [concurrency] and concurrent subset ID [subset] can be specified to enable concurrent calculations. For
non-concurrent ones, use concurrency=1, subset=0.
*/
func TranslateStarVectorListSubset(list []Star, viewpoint Star, sightline CartesianVector, angle float64, magnitude float64, time float64, concurrency int, subset int) []Star {
	var filteredList []Star
	directionCosine := math.Cos(angle)
	scaledLum := AbsMagToLuminosity(5.0 + magnitude) // scaled luminosity, or luminosity /distance^2, is functionally equivalent to apparent magnitude, but faster to compute for a star. No logarithms.
	for i := subset; i < len(list); i += concurrency {
		star := TranslateStar(list[i], viewpoint, time)
		passes := StarPassesFilter(star, sightline, directionCosine, scaledLum)
		if passes {
			filteredList = append(filteredList, star)
		}
	}
	return filteredList
}
