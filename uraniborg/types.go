// uraniborg/types.go: type definitions for the application
package main

// ----------------------------
// Color management

type ChartColor struct {
	// Encapsulate RGB colors as their own type:
	R float64 `yaml:"r"`
	G float64 `yaml:"g"`
	B float64 `yaml:"b"`
}

// Schemes are collections of colors and other stylistic information to apply to a chart,
// as a group.

type SchemeColors struct {
	Background          *ChartColor `yaml:"background"`          // Color of the chart background
	MainLabel           *ChartColor `yaml:"main_label"`          // Color of the primary (below magnitude label cutoff) label
	DistanceLabel       *ChartColor `yaml:"distance_label"`      // Color of nearby star labels
	MotionLabel         *ChartColor `yaml:"motion_label"`        // Color of star labels (and arrows) for stars with significant motion
	Caption             *ChartColor `yaml:"caption"`             // Color of the caption
	CenterMark          *ChartColor `yaml:"center_mark"`         // Color of the center mark (crosshair/reticle)
	CoordinateGrid      *ChartColor `yaml:"coordinate_grid"`     // Color of the coordinate grid
	ConstellationLabels *ChartColor `yaml:"constellation_names"` // Color of constellation name labels
	HighlightedStars    *ChartColor `yaml:"highlighted_stars"`   // Color of stars designated to be highlighted
}

type StarburstValues struct {
	ImageSize  float64 `yaml:"image_size"`  // Size of the base image, in pixels, below which there is no starburst. A value of 0.0 disables the effect.
	LineLength float64 `yaml:"line_length"` // Size of the starburst lines (how far they protrude from each side of the base image as a multiple of the base image's size)
	Brightness float64 `yaml:"brightness"`  // Brightness of the starburst lines, as a multiple of the base image brightness.
}

type SchemeStarSymbols struct {
	// Settings for star symbols
	MinStarLevel         float64          `yaml:"min_star_level"`         // Minimum grayscale level for star symbols. This value is typically 0.25 or so.
	MaxStarLevel         float64          `yaml:"max_star_level"`         // Maximum grayscale level for start symbols. This value is typically 1.0, except in black on white modes, where it may be close to 0.0.
	BaseStarSize         float64          `yaml:"base_star_size"`         // Size of smallest (dimmest) star symbol (pixels). Usually close to 1.0. Sizes below 1.0 will make a range of faint stars all the same size.
	StarSizeChange       float64          `yaml:"star_size_change"`       // Change in star symbol radius per magnitude.
	StarBrightnessChange float64          `yaml:"star_brightness_change"` // Change in star symbol grayscale level (0 = black, 1 = white) per magnitude.
	LegendStarSeparation float64          `yaml:"legend_separation"`      // Factor to multiply base offset between star symbols in the legend
	Starburst            *StarburstValues `yaml:"starburst"`              // Settings for optional starburst effect

}

type SchemeMotionSymbols struct {
	// Settings for the motion-indicator arrows
	MinimumLength   float64 `yaml:"minimum_length"`   // Minimum allowed length for a motion "arrow" symbol (in pixels; don't draw if motion is less than this)
	ArrowheadLength float64 `yaml:"arrowhead_length"` // Length of lines making up the arrowhead portion (in pixels)
	ArrowheadAngle  float64 `yaml:"arrowhead_angle"`  // Angle between each arrowhead line and the main line (in degrees)
}

type SchemeCenterMarkSymbols struct {
	// Settings for the crosshair center marker
	BarLength float64 `yaml:"bar_length"` // Length of each line in the crosshairs
	BarOffset float64 `yaml:"bar_offset"` // Distance between chart center and the starting point of each line
}

type SchemeSymbols struct {
	StarSymbols       *SchemeStarSymbols       `yaml:"star"`        // Parameters controlling the sizes and brightnesses of star symbols.
	MotionSymbols     *SchemeMotionSymbols     `yaml:"motion"`      // Parameters controlling the appearance of the motion arrow symbols.
	CenterMarkSymbols *SchemeCenterMarkSymbols `yaml:"center_mark"` // Parameters controlling the appearance of the center marker/crosshairs.
}

type SchemeFont struct {
	File string `yaml:"file"` // Location of font to use
	Size int    `yaml:"size"` // Size of font to use
}

type SchemeFonts struct {
	// Fonts for labels/captions/etc.
	Caption *SchemeFont `yaml:"caption"`
	Label   *SchemeFont `yaml:"label"`
}

type SchemeLabels struct {
	// Settings affecting labels and captions other than fonts
	LabelProximity *ScreenPoint `yaml:"label_proximity"` // minimum allowed distance b/w labels; if a star to be labeled is within this distance from an already labeled star, don't label the new one
	LabelOffset    *ScreenPoint `yaml:"label_offset"`    // amount to offset labels from star symbols.
	CaptionOffset  *ScreenPoint `yaml:"caption_offset"`  // amount to offset captions from the top left corner (.x) and between caption lines (.y)
}

type ChartScheme struct {
	Name    string         `yaml:"name"`    // A name for the theme. For themes included with uraniborg, is the same as the filename minus ".yaml"
	Colors  *SchemeColors  `yaml:"colors"`  // color collection
	Symbols *SchemeSymbols `yaml:"symbols"` // symbol configuration/parameters
	Fonts   *SchemeFonts   `yaml:"fonts"`   // font names + sizes
	Labels  *SchemeLabels  `yaml:"labels"`  // label settings

}

// ScreenPoint is generic 2-D screen point management
// This is currently mostly used for x - y coordinates in 2D graphics.
type ScreenPoint struct {
	X float64 `yaml:"x"`
	Y float64 `yaml:"y"`
}

// ------------------------------
// Handle user + application configuration.
// Letting presets do much of the heavy lifting seems desirable. Package more prefab scenarios and bury some of the overt complexity at first.

type ApplicationConfiguration struct {
	// Application-level (set once at runtime)
	DataFile    string `yaml:"datafile"`    // Name of data file containing star data. AT-HYG schema v2.2+ expected.
	Concurrency int    `yaml:"concurrency"` // Concurrency level for # of processing routines
}

type UserConfiguration struct {
	// User-configurable configuration (can be freely changed during a run)
	// Location info
	From string `yaml:"from" json:"from"` // Name of star/object to view from. Optionally includes xyz coordinates (4 CSV values, starting with the name) to define a custom location
	To   string `yaml:"to" json:"to"`     // Name of star/object to look toward and center chart on. Optionally includes xyz coordinates (4 CSV values, starting with the name) to define a custom location

	// Chart label/annotation config
	Magnitude      float64 `yaml:"magnitude" json:"magnitude"`           // Stars fainter than this are not shown
	MagnitudeLabel float64 `yaml:"magnitudelabel" json:"magnitudelabel"` // Stars fainter than this are not labeled (exceptions for special labels like low distance)
	DistanceLabel  float64 `yaml:"distancelabel" json:"distancelabel"`   // Stars closer than this get a special label. Unit is parsecs, unless UseLightyears is set to true.
	LabelType      int     `yaml:"labeltype" json:"labeltype"`           // Indicate degree of detail in star labels. Default (=0) is names only.

	// Plot (image) config
	Scale      float64 `yaml:"scale" json:"scale"`           // scale of 1.0 is approx. 90 degree field of view. 2.0 = 45 degrees, etc.
	Width      int     `yaml:"width" json:"width"`           // width of plot, in pixels
	Projection int     `yaml:"projection" json:"projection"` // Integer ID of map projection type to use
	Aspect     float64 `yaml:"aspect" json:"aspect"`         // Aspect ratio of the chart, as max_x : max_y ratio (e.g. 16/9 = 1.777 ... )

	// Motion config
	Time        float64 `yaml:"time" json:"time"`       // epoch is 2000.0. To show stars at different times, set Time != 0 (negative for before epoch). Unit is decimal years.
	ShowMotions bool    `yaml:"motions" json:"motions"` // if true, show line/arrow to star position. If false, translate the star itself before plotting. Default is "true"

	// Miscellany
	Notes                   string `yaml:"notes" json:"notes"`                   // Optional notes to add to the chart caption
	ShowCoordinates         bool   `yaml:"coordinates" json:"coordinates"`       // Enable or disable the coordinate grid.
	ShowLegend              bool   `yaml:"legend" json:"legend"`                 // Enable or disable the chart legend (currently shows magnitude symbol range)
	ShowConstellationLabels bool   `yaml:"constellations" json:"constellations"` // Enable or disable constellation name labels
	UseLightyears           bool   `yaml:"lightyears" json:"lightyears"`         // Toggle distance displays in light years vs parsecs (default is parsecs). Also makes Uraniborg use light years for the DistanceLabel.
	UseGalacticCoordinates  bool   `yaml:"galactic" json:"galactic"`             // Toggle galactic (true) vs equatorial (false) coordinate grids and map projection orientations

	// Meta-config (configuration presets and color schemes)
	ChartName    string       `yaml:"chartname" json:"chartname"`     // A name for the chart file (= actual filename without the ".png" or ".jpeg" extension)
	ImageFormat  string       `yaml:"imageformat" json:"imageformat"` // Image file type. Can be either "png" or "jpeg".
	Preset       string       `yaml:"preset" json:"preset"`           // A preset for setting multiple prefab configuration settings all at once.
	Scheme       string       `yaml:"scheme" json:"scheme"`           // The name of the color scheme to load.
	SchemeData   *ChartScheme // Struct of color definitions as RGB colors. This won't come from the config YAML file, at least not right now. Selected via Scheme above.
	Highlight    string       `yaml:"highlight" json:"highlight"` // List of stars (by name/ID) to highlight.
	HighlightIds []int        // List of star IDs (as AT-HYG catalog IDs) to highlight. Determined from the Highlight field if it is present.
	StereoOffset float64      `yaml:"stereo" json:"stereo"` // Base offset for side-by-side stereo mode. Offset for each star = StereoOffset/d pixels (d = distance to star)
}

// The FileLoadable interface comprises types that can be loaded from (YAML) files:
type FileLoadable interface {
	ChartScheme | UserConfiguration | ApplicationConfiguration
}
