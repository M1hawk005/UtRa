# Additional Details

This goes into more detail on more advanced or background aspects of `uraniborg`.

## Data Sources

`uraniborg`, by itself, does not come with the full AT-HYG catalog, because of its size (~400 MB uncompressed). It comes with a subset of the catalog, which contains:

- all AT-HYG stars within 100 light years (30.65 parsecs)
- all other AT-HYG stars with an apparent magnitude of +10.0 or brighter

This is about 15% of the full AT-HYG catalog, and is sufficient for naked-eye (and somewhat dimmer) charts centered on any star closer to the Sun than about 80 light years. So for your classic "what does the naked-eye sky look like from [famous nearby star]" sorts of charts, there's no difference. However, for deeper charts showing fainter stars, or for more realistic views from somewhat further out, you will want to download a larger catalog from https://codeberg.org/astronexus/athyg.

Data source files are CSV files and should live in the `data` directory. To use a new data source, download the source, uncompress it if it is a .gz or .zip file, and put the resulting CSV file in `data`. Then update the `application.yaml` file to point to the new data source, using the `datafile` field. Example for the full AT-HYG catalog v3.0:

```
  datafile: athyg_v30.csv
```
Since this is an application configuration item, you will need to stop and restart `uraniborg` for the data source change to take effect. More information about application configuration is in the section "Configuration Files" immediately below.

## Configuration Files

Configuration files are the primary source of information that `uraniborg` users to determine what to plot and how to do it.

### File Structure

- `config/`: contains all configuration files
- `config/presets/`: contains preset configuration option collections (see "Presets" below for more details)
- `config/schemes/`: contains collections of style and formatting parameters (see "Schemes" below for more details)

The core files in the main `config/` directory are:

- `config/main.yaml`: the primary configuration file (changes per chart). This is the one you edit to change things like chart location, size, and magnitude limits.
- `config/application.yaml`: the application configuration (only loaded once, on application start)
- `config/default.yaml`: the standard defaults (for when fields are not set)

### Main vs. Application Configuration

In the `config` directory, along with the `config/main.yaml` file for changing chart options during a run, there is a `config/application.yaml` file that contains configuration options that do not change during a run. Changes to `config/application.yaml` options only take effect when `uraniborg` is stopped and restarted.

Currently there are two items you can set in the application configuration:

1. `datafile`: The name of the star data file to use. If this is missing or invalid, a default data source (the one included with `uraniborg`) will be used.
2. `concurrency`: `uraniborg` supports concurrent calculations of star positions and velocities when available. Concurrent operations can make these calculations run several times faster if they are supported. If this is missing or invalid, the `concurrency` will be set to 1 -- i.e., no concurrent calculations. Concurrency levels can be set up to the available CPU cores in your system and will be capped at that level if a larger number is specified.

### Defaults

All user configuration options have a default value. The standard defaults are set in the file `config/default.yaml`. Defaults described below (in "User Configuration Field+Values") are the ones set by that file. 

If a configuration item is not set anywhere, either in the `default.yaml` file or in another user configuration, it will become 0 for numeric (integer/floating point) values, an empty string for string values, and `false` for Boolean values.

Additional detail for all the allowed parameter values for configuration files (`config/main.yaml` and the files in `config/presets/`) is in CONFIGS.md.

## Presets

Presets are collections of configuration parameters from `config/main.yaml`. When you select a preset with the `preset` parameter, the chosen preset will be loaded as part of the configuration. When a preset is selected in the main user configuration file, the preset configuration options are loaded first, and then will be merged with any values found in the main config.yaml file. The values set in the main file take priority; any value in `config/main.yaml` that differs from its corresponding preset option will override that preset option.

The `preset` parameter is just the name of the preset file without the ".yaml" extension. So to use the file `/config/presets/mag_7.yaml`, you would set `preset : mag_7` in the user config file.

### Preset Collection

There are three general categories of presets that come with `uraniborg`:

- magnitude-based
- star atlas emulators
- all-sky charts emphasizing nearby stars

The "magnitude-based" have file names starting with `mag_`, indicating the magnitude cutoff. These range from `mag_5` (stars visible in a suburban naked eye sky) to `mag_12` (stars visible in a small telescope -- 4" / 100 mm or so). Chart magnifications increase with magnitude as well to keep the number of stars reasonable. 

The "star atlas" presets are meant to approximate the magnitude limits, chart scale, level of chart detail, and aspect ratios of several popular printed star atlases widely used by amateur astronomers. The rough correspondences are:

- `atlas_1` : Cambridge Sky Atlas (magnitude +6.5)
- `atlas_2` : Sky Atlas 2000 (magnitude +8.0)
- `atlas_3` : Uranometria 2000 (edition 1; narrow charts) (magnitude +10.0)
- `atlas_4` : Uranometria 2000 (edition 2; wide charts) (magnitude +10.0)
- `atlas_5` : Millennium Sky Atlas (magnitude +12.0; best with full AT-HYG catalog)

The "nearby" presets use a map projection that renders the entire sky, and labels primarily nearby stars (other stars are labeled only if very bright). The two levels differ in the number of stars shown overall (magnitude +5.0 vs magnitude +7.0) and in the distance cutoff for what is considered "nearby" (6 parsecs vs 8 parsecs).

## Schemes

Most user configuration details cover the 'information' of a chart: the location, the time frame, etc. Most of the 'appearance', such as colors, fonts, and symbols, is controlled by the chart's "scheme". Schemes live in the directory `config/schemes`, and like other configuration-related files, are YAML files. 

The primary scheme is called `default.yaml`. It is used whenever no scheme is specified. To specify another scheme, add a `scheme` field to `config/main.yaml`, like this:

```
  from: Sol
  to: Sirius
  scheme: retro

```

A few sample schemes are part of the standard distribution:

- `default`: The scheme used when no other scheme is specified. It has white stars on a dark (very dark blue) background. Its colors are chosen to be clear but not garish. 
- `small`: This scheme has smaller star symbols with a more gradual brightness difference as stellar magnitude changes. It is designed to look a little more like the actual night sky to the eye.
- `large`: The reverse idea: it has somewhat larger star symbols and star labels than the default. It is designed for larger charts in particular (more than about 2k pixels wide or tall or both).
- `inverse`: This scheme has black stars on a white background, and is designed for printing. Labels are in various levels of gray, and star symbol sizes are somewhat exaggerated in size compared to other schemes. 
- `night_vision`: This scheme is similar to the default for text and star symbol size, but stars are drawn with subdued gray, and other labels are dark red.
- `retro`: This one is slightly silly. It has very bright colors that resemble many desktop computer star chart programs from the 1990s.

To see what these schemes look like in practice, read `examples/SCHEMES.md`. 