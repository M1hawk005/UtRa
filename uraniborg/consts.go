// uraniborg/consts.go: important constants used in multiple places
package main

// Configuration items that are not likely to change often via user input. Config that can or should be changed "on the fly"
// should go into the user (main) config, the application config, a configuration preset, or a color/style scheme file.

// Special names and IDs for the custom viewpoint (a.k.a. source or origin) and target "star" objects, when setting a position directly
// (via Cartesian coordinates) rather than doing a lookup against known star positions.
// -----------------------------

// PLACEHOLDER_OBJECT_ID is a placeholder ID value for newly-created arbitrary Star objects that do not correspond to
// items in a pre-existing catalog. It is the suggested starting ID when not immediately loading data from another source, and
// must be non-positive to avoid conflicts with existing catalog ID numbers.
// In general, non-positive IDs can be used to indicate special types of object (see CUSTOM_VIEWPOINT_ID
// and CUSTOM_TARGET_ID for other examples).

const PLACEHOLDER_OBJECT_ID = 0

// PLACEHOLDER_ABS_MAG is the absolute visual magnitude to use for newly-created arbitrary Star objects (to ensure they are
// not visible objects).
const PLACEHOLDER_ABS_MAG = +25.0

// CUSTOM_VIEWPOINT_ID is for the point in space that the chart is being viewed from.
// This value has to be outside the range 0 - catalog size to avoid clashes with actual star IDs.
const CUSTOM_VIEWPOINT_ID = -1

// CUSTOM_TARGET_ID is for the point being looked towards and at the chart center.
// Like the custom viewpoint ID, it needs to exist outside the range of actual stars' ID numbers.
const CUSTOM_TARGET_ID = -2

// Standard locations for key files. These shouldn't need routine changing.
// -----------------------------

// DEFAULT_DATA_FILE should be the one supplied with the repository.
const DEFAULT_DATA_FILE = "athyg_33_subset.csv"

// DEFAULT_BASE_DIR is the default directory for all support files, like configurations, fonts, and chart output. It defaults to the application main directory.
const DEFAULT_BASE_DIR = "."

// DEFAULT_CONFIG_DIR is the default location of all configuration and preset files, with respect to the application main directory
const DEFAULT_CONFIG_DIR = "config"

// DEFAULT_CHARTS_DIR is the default location of where chart image files are written to, with respect to the application main directory
const DEFAULT_CHARTS_DIR = "charts"

// DEFAULT_DATA_DIR is the default location of the directory that contains star catalogs for the application, with respect to the application main directory
const DEFAULT_DATA_DIR = "data"

// DEFAULT_FONT_DIR is the default location of the directory with fonts for the application
const DEFAULT_FONT_DIR = "fonts"

// OUTPUT_FILE is the standard filepath for the image output
const OUTPUT_FILE = "output"

// USER_CONFIG_FILE contains per-run configuration (changing this generates a new chart)
const USER_CONFIG_FILE = "main.yaml"

// APPLICATION_CONFIG_FILE contains application-level configuration, loaded when the application starts
const APPLICATION_CONFIG_FILE = "application.yaml"

// DEFAULT_CONFIG_FILE contains a basic default per-run configuration. This supplies any values that might be missing in USER_CONFIG_FILE.
const DEFAULT_CONFIG_FILE = "default.yaml"

// CONFIG_PRESETS_DIR is the directory for configuration preset files
const CONFIG_PRESETS_DIR = "presets/"

// CONFIG_SCHEMES_DIR is the directory for style/appearance scheme files
const CONFIG_SCHEMES_DIR = "schemes/"

// DEFAULT_SCHEME_FILE is the filepath for a default scheme, used when no other is specified or can be found
const DEFAULT_SCHEME_FILE = CONFIG_SCHEMES_DIR + "default.yaml"

// DEFAULT_SCHEME_NAME is the name assigned to the default theme. It is used to verify it loads.
const DEFAULT_SCHEME_NAME = "default"

// Coordinate grid configuration
// -----------------------------

// MIN_LAT and similar values define valid latitude+longitude ranges for coordinate grids, in integer degrees:
const MIN_LAT = -90
const MAX_LAT = 90
const MIN_LONG = 0
const MAX_LONG = 360

// GRID_BORDER defines how far "outside" the chart boundaries will be considered in bounds for plotting a grid segment. This is to allow segments to cross the boundary
// instead of abruptly terminating inside the charted area.
const GRID_BORDER = 0.15

// MIN_GRID_SCALE and MAX_GRID_SCALE are the lowest and highest (respectively) values of the "scale" parameter allowed for grid plotting.
// Values outside these boundaries won't show a grid even if the "coordinates" parameter is set to true.
const MIN_GRID_SCALE = 0.5
const MAX_GRID_SCALE = 20.0

// GRID_LABEL_X_OFFSET and GRID_LABEL_Y_OFFSET are offsets, in pixels, for text labels.
const GRID_LABEL_X_OFFSET = 10.0
const GRID_LABEL_Y_OFFSET = 10.0

// LEGEND_OFFSET defines the fraction of the chart's width to offset the legend by (i.e., away from the right edge)
const LEGEND_OFFSET = 0.01

// POINT_EQUALITY_CRITERION defines how closely together two floating-point numbers can be to be considered equal.
const POINT_EQUALITY_CRITERION = 1e-6

// Chart formatting (map projections and label options)
// -----------------------------

// BASE_ANGLE_MULTIPLIER specifies the desired angle size, in radians, for a plot with an aspect ratio of 1:1 and a scale of 1 to plot w/o losing stars in the corners.
// This figure gets adjusted for chosen scale and aspect ratio to ensure the entire chart area gets used.
const BASE_ANGLE_MULTIPLIER = 0.65

// PROJ_ORTHOGRAPHIC and other PROJ_ values are mnemonic values for chart projection types (all azimuthal projections right now)
const (
	PROJ_ORTHOGRAPHIC = iota + 1
	PROJ_STEREOGRAPHIC
	PROJ_EQUIDISTANT
	PROJ_EQUAL_AREA
)

// LABEL_PRIMARY and other LABEL_ values are mnemonic values for chart labeling schemes
const (
	LABEL_PRIMARY = iota
	LABEL_NAME
	LABEL_SECONDARY
	LABEL_STAR_ATLAS
)

// Configuration constraints. Used to keep certain values from producing charts that are illegible or difficult to manage.
// -----------------------------

// MAX_WIDTH and other MAX_ and MIN values are input limits. These shouldn't routinely change.
const MAX_WIDTH = 4096                   // pixels
const MIN_WIDTH = 400                    // also pixels
const MAX_MAGNITUDE = 18.0               // Tycho goes only to ~12. Fainter stars can appear, but only up to a point; isolated (e.g.) +13.5 stars look strange amidst all the others <~ 12 or so.
const MAX_LABEL_MAGNITUDE = 18.0         // In some charts, the target or "to" star can be far enough away that we can't see it, but we still want to label how faint it is. Up to a point.
const MAX_SCALE = 500                    // ~ 1/6 degree wide
const MIN_SCALE = 0.10                   // full-sky charts only need ~0.25. Values <= 0 are not physically meaningful. Values close to 0 give largely illegible charts.
const MIN_ASPECT = 0.10                  // values less than or close to 0 are not meaningful
const MAX_ASPECT = 2.5                   // similar: large aspect ratios are not useful. Because charts have an angle restriction on allowed stars, above about this point they always show empty space (outside the defined view angle w/ no stars)
const PROXIMITY_LIMIT = 0.0001           // in parsecs: stars closer than this to the viewpoint are not plotted
const PLACEHOLDER_DISTANCE = 100000000.0 // in parsecs; used in some calculations to represent "extremely large"

// Miscellany
// -----------------------------

// ALERT_HEADER is distinctive header text used in log output.
const ALERT_HEADER = "**** uraniborg:"

// TIME_LOG_ENABLE enables (when true) or disables logging of elapsed times for steps.
const TIME_LOG_ENABLE = true

// JPEG_QUALITY is the output quality when creating images in .jpeg format.
// JPEG is faster to save but generally inferior to PNG otherwise; there's rather little reason to use anything other than max quality.
const JPEG_QUALITY = 100 // max supported by jpeg package in std. library
