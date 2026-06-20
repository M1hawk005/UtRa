# brahe

Brahe is a collection of utilities in Go for working with the Augmented Tycho - HYG star catalog (https://codeberg.org/astronexus/athyg).

## Specifics

- `athyg.go`: defines tools for reading and parsing the AT-HYG catalog (versions 2.2 - current)
- `brahe.go`: base file for the library. It defines a Star data type for the data found in AT-HYG and a few other types useful for data processing.
- `consts.go`: constants used within the `brahe` module
- `constellations.go`: defines standard names, abbreviations, and genitive forms for the 88 Western constellations, plus locations suitable for adding their names when drawn on a chart
- `lists.go`: defines several types of lists of Star objects useful for reporting and charts
- `utils.go`: defines various astronomical conversion utilities, for both generic data and Star object data

See [./USAGE.md](./USAGE.md) for some specific examples of tasks `brahe` can perform.

## Dependencies

`brahe` uses the [gonum floating point library](https://pkg.go.dev/gonum.org/v1/gonum/floats) for vector math. 

## License

### Brahe is licensed under the following license:

Copyright 2024, David Nash

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.