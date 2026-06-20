# Scheme Parameters

## Scheme Basics

Schemes are how `uraniborg` controls most presentation aspects, such as colors, fonts, and symbol details. They live in the `config/schemes/` directory.

By default, every chart will use the scheme file named `default.yaml`. Different schemes can be specified in a user configuration or a configuration preset file with the `scheme` field. Similarly to configuration presets, the name in this field is the name of the scheme file without the `.yaml` extension. For example, `scheme` : `retro` in a configuration or a preset will load the scheme `config/schemes/retro.yaml` when `uraniborg` loads the configuration.

Like any other field in a configuration file, the `scheme` value takes effect as soon as the user configuration is saved. You don't need to restart `uraniborg` to change the scheme for a chart.

*Important*: Each configuration uses one and only one scheme at any given time, and its parameters are defined by whichever scheme file is associated with the configuration. If you select a scheme other than the default, its fields will be used exactly as they are in the scheme file. They will not be "merged" with the default scheme fields or any other scheme's fields.

## Scheme Components

Since every field in a scheme file is relevant to presentation, and since a `uraniborg` chart always uses a single scheme file, it's important to make sure that all the fields defined below are present. In particular, you won't get a "default" value for a scheme field if you delete it from an active scheme file. 

If you are creating or editing schemes for the first time, it's a good idea to make a copy of the `default.yaml` scheme and customize it first, rather than hacking the `default.yaml` file, until you have a good sense of what's going on.

### Name

The `name` field sets a name for the scheme. The included schemes all use the scheme filename minus the `.yaml` extension as their names, but if you create your own scheme, you can choose whatever name you want.

### Colors

The `colors` section controls all the colors used when drawing a chart. Each color contains RGB values ranging from 0.0 to 1.0.

- `background`: The color of the chart background.
- `main_label`: The color of the label used for most stars. Specifically, the color of the label for stars that are brighter than the `magnitudelabel` value in the chart configuration, and not otherwise specially labeled, such as for distance or motion.
- `distance_label`: The color of the label used for relatively close stars (below the `distancelabel` value in the chart configuration). This color overrides the `main_label` color.
- `motion_label`: The color of the label used for stars with significant motion, as well as the arrow indicating motion direction and amount. Unlike `distance_label`, the `motion_label` color does not override other label colors. The arrow will always have this color, but the `motion_label` color will only be used for stars that are not already labeled by another color. That is, stars that are already labeled because they are bright or nearby won't have those label colors changed.
- `caption`: The color of the information caption at the top of the chart.
- `center_mark`: The color of the plus-shaped mark at the center of the chart. If there is a star at the center and it is not already otherwise labeled, it will get a label with the `center_mark` color.

### Fonts

The `fonts` section controls the fonts used for text displays in `uraniborg`. `uraniborg` comes with several open-source fonts. The schemes included with `uraniborg` all refer to one or more of them. 

Conventionally, fonts live in the `fonts` directory in the main `uraniborg` directory.

- `caption`: Contains the file name and font size (in pixels) for the caption at the top of the chart.
- `label`: Contains the file name and font size (in pixels) for the star labels.

### Symbols

The `symbols` section controls the appearance of two general types of symbols: those for stars and those for the arrows showing motions.

#### Star Symbols

The `star` subsection of `symbols` contains various settings that control how the star symbols look. Finding the right star appearance is as much of an art as a science, so feel free to make your own custom scheme and experiment with the various settings.

Stars are drawn using grayscale (R=G=B for all colors), with a range of 0.0 (black) to 1.0 (bright white). Most star symbols are drawn as antialiased grayscale circles, which are controlled by the parameters given below. 

- `min_star_level`: The lowest grayscale level (used for the faintest stars)
- `max_star_level`: The highest grayscale level (used for the brightest stars). 
- `base_star_size`: The radius, in pixels, of the smallest star size.
- `star_size_change`: The change in radius (in pixels) per 1.0-magnitude change in star brightness.
- `star_brightness_change`: The change in grayscale level per 1.0-magnitude change in star brightness.
- `starburst`: Applies a starburst effect to the largest (brightest) symbols. This makes brighter stars slightly more prominent than they would be otherwise.
    - `image_size`: Sets the cutoff size for starburst effects. Star images with a radius smaller than `image-size` pixels will not have the effect.
    - `line_length`: Sets the size of the lines in the starburst, as a multiplier of the base star image's size. 1.0 makes the lines' length the same as the radius of the star image.
    - `brightness`: Sets the brightness of the lines, as a fraction of the star's overall brightness. 

#### Motion Symbols

The `motion` subsection  of `symbols` controls the appearance of the arrows that appear when stars with significant motion are displayed with `motions` set to `true` in a configuration.

- `minimum_length`: In pixels. This is the smallest arrow that can be drawn. If it would be shorter than `minimum_length`, it won't be rendered. 
- `arrowhead_length`: The length of the two lines making up the arrowhead, in pixels.
- `arrowhead_angle`: The angle between the main arrow line and either of the two lines making up the arrowhead. The angle is given in degrees.

### Labels

The `labels` section controls miscellaneous aspects of star label display and placement.

- `label_proximity`: Controls how closely labels may be placed together and still be displayed. Labels for stars are drawn in order of star brightness, brighter stars first. Any label that would be drawn closer to an existing label's position than `x` pixels horizontally and `y` pixels vertically will be skipped. This keeps labels for faint components of double stars or faint stars in tightly packed groups (like the Pleiades at low magnification) from overwriting each other and cluttering up the image.
- `label_offset`: Controls how much, and in which direction, the label for a star is offset from the star symbol. It is offset `x` units to the right and `y` units above the center of the star symbol.
- `caption_offset`: The `x` value controls how far right of the edge the caption is rendered, and the `y` value controls how much spacing exists between lines in the caption.