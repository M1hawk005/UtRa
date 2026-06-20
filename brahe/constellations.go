// constellations.go

package brahe

// Constellation data: information regularly used about each of the major constellations.

// LabelLocations is a list of right ascension/declination pairs (in decimal hours + decimal degrees) representing the constellation's general location(s) in the sky.
type LabelLocations []EquatorialPosition

// ConstellationDetails is a collection of useful information about a constellation.
type ConstellationDetails struct {
	Name          string         // The official name of the constellation, e.g. "Centaurus"
	Genitive      string         // The Latin genitive form used in star and object designations, e.g. "Alpha Centauri"
	Abbreviation  string         // The official 3-letter abbreviation of the constellation, e.g. "Cen"
	LabelLocation LabelLocations // This is a list because some constellations are large, and one (Serpens) is disjoint, so it's useful to be able to label multiple locations.
}

// Constellations is a map of constellation IDs (generally their abbreviations) to a ConstellationDetails object.
type Constellations map[string]ConstellationDetails

var CONSTELLATION_DATA = Constellations{
	"And": ConstellationDetails{"Andromeda", "And", "Andromedae", LabelLocations{EquatorialPosition{0.5, 40}}},
	"Ant": ConstellationDetails{"Antlia", "Antliae", "Ant", LabelLocations{EquatorialPosition{10.0, -35.0}}},
	"Aps": ConstellationDetails{"Apus", "Apodis", "Aps", LabelLocations{EquatorialPosition{16.0, -77.5}}},
	"Aqr": ConstellationDetails{"Aquarius", "Aquarii", "Aqr", LabelLocations{EquatorialPosition{22.0, -5.0}}},
	"Aql": ConstellationDetails{"Aquila", "Aquilae", "Aql", LabelLocations{EquatorialPosition{19.5, 0.0}}},
	"Ara": ConstellationDetails{"Ara", "Arae", "Ara", LabelLocations{EquatorialPosition{17.0, -55.0}}},
	"Ari": ConstellationDetails{"Aries", "Arietis", "Ari", LabelLocations{EquatorialPosition{2.5, 20.0}}},
	"Aur": ConstellationDetails{"Auriga", "Aurigae", "Aur", LabelLocations{EquatorialPosition{5.75, 40.0}}},
	"Boo": ConstellationDetails{"Bootes", "Bootis", "Boo", LabelLocations{EquatorialPosition{14.5, 30.0}}},
	"Cae": ConstellationDetails{"Caelum", "Caeli", "Cae", LabelLocations{EquatorialPosition{4.5, -40.0}}},
	"Cam": ConstellationDetails{"Camelopardalis", "Camelopardalis", "Cam", LabelLocations{EquatorialPosition{6.0, 70.0}}},
	"Cnc": ConstellationDetails{"Cancer", "Cancri", "Cnc", LabelLocations{EquatorialPosition{8.5, 20.0}}},
	"CVn": ConstellationDetails{"Canes Venatici", "Canum Venaticorum", "CVn", LabelLocations{EquatorialPosition{13.0, 40.0}}},
	"CMa": ConstellationDetails{"Canis Major", "Canis Majoris", "CMa", LabelLocations{EquatorialPosition{6.75, -20.0}}},
	"CMi": ConstellationDetails{"Canis Minor", "Canis Minoris", "CMi", LabelLocations{EquatorialPosition{7.5, 10.0}}},
	"Cap": ConstellationDetails{"Capricornus", "Capricorni", "Cap", LabelLocations{EquatorialPosition{21.0, -20.0}}},
	"Car": ConstellationDetails{"Carina", "Carinae", "Car", LabelLocations{EquatorialPosition{8.0, -55.0}}},
	"Cas": ConstellationDetails{"Cassiopeia", "Cassiopeiae", "Cas", LabelLocations{EquatorialPosition{1.0, 65.0}}},
	"Cen": ConstellationDetails{"Centaurus", "Centauri", "Cen", LabelLocations{EquatorialPosition{13.0, -45.0}}},
	"Cep": ConstellationDetails{"Cepheus", "Cephei", "Cep", LabelLocations{EquatorialPosition{22.0, 65.0}}},
	"Cet": ConstellationDetails{"Cetus", "Ceti", "Cet", LabelLocations{EquatorialPosition{2.0, -5.0}}},
	"Cha": ConstellationDetails{"Chamaeleon", "Chamaeleontis", "Cha", LabelLocations{EquatorialPosition{10.0, -80.0}}},
	"Cir": ConstellationDetails{"Circinus", "Circini", "Cir", LabelLocations{EquatorialPosition{15.0, -60.0}}},
	"Col": ConstellationDetails{"Columba", "Columbae", "Col", LabelLocations{EquatorialPosition{5.5, -40.0}}},
	"Com": ConstellationDetails{"Coma Berenices", "Comae Berenices", "Com", LabelLocations{EquatorialPosition{12.75, 20.0}}},
	"CrA": ConstellationDetails{"Corona Australis", "Coronae Australis", "CrA", LabelLocations{EquatorialPosition{18.75, -40}}},
	"CrB": ConstellationDetails{"Corona Borealis", "Coronae Borealis", "CrB", LabelLocations{EquatorialPosition{16.00, 30.0}}},
	"Crv": ConstellationDetails{"Corvus", "Corvi", "Crv", LabelLocations{EquatorialPosition{12.5, -20.0}}},
	"Crt": ConstellationDetails{"Crater", "Crateris", "Crt", LabelLocations{EquatorialPosition{11.25, -15}}},
	"Cru": ConstellationDetails{"Crux", "Crucis", "Cru", LabelLocations{EquatorialPosition{12.75, -62.5}}},
	"Cyg": ConstellationDetails{"Cygnus", "Cygni", "Cyg", LabelLocations{EquatorialPosition{20.5, 35.0}}},
	"Del": ConstellationDetails{"Delphinus", "Delphini", "Del", LabelLocations{EquatorialPosition{20.5, 15.0}}},
	"Dor": ConstellationDetails{"Dorado", "Doradus", "Dor", LabelLocations{EquatorialPosition{5.0, -65.0}}},
	"Dra": ConstellationDetails{"Draco", "Draconis", "Dra", LabelLocations{EquatorialPosition{17.0, 60.0}}},
	"Equ": ConstellationDetails{"Equuleus", "Equulei", "Equ", LabelLocations{EquatorialPosition{21.1, 10.0}}},
	"Eri": ConstellationDetails{"Eridanus", "Eridani", "Eri", LabelLocations{EquatorialPosition{4.0, -30.0}}},
	"For": ConstellationDetails{"Fornax", "Fornacis", "For", LabelLocations{EquatorialPosition{3.0, -30.0}}},
	"Gem": ConstellationDetails{"Gemini", "Geminorum", "Gem", LabelLocations{EquatorialPosition{7.0, 25.0}}},
	"Gru": ConstellationDetails{"Grus", "Gruis", "Gru", LabelLocations{EquatorialPosition{22.5, -45.0}}},
	"Her": ConstellationDetails{"Hercules", "Herculis", "Her", LabelLocations{EquatorialPosition{17.5, 30.0}}},
	"Hor": ConstellationDetails{"Horologium", "Horologii", "Hor", LabelLocations{EquatorialPosition{3.5, -50.0}}},
	"Hya": ConstellationDetails{"Hydra", "Hydrae", "Hya", LabelLocations{EquatorialPosition{9.5, -15.0}, EquatorialPosition{13.5, -25.0}}}, // very large, appropriate to have two labels
	"Hyi": ConstellationDetails{"Hydrus", "Hydri", "Hyi", LabelLocations{EquatorialPosition{2.0, -70.0}}},
	"Ind": ConstellationDetails{"Indus", "Indi", "Ind", LabelLocations{EquatorialPosition{21.0, -55.0}}},
	"Lac": ConstellationDetails{"Lacerta", "Lacertae", "Lac", LabelLocations{EquatorialPosition{22.5, 45.0}}},
	"Leo": ConstellationDetails{"Leo", "Leonis", "Leo", LabelLocations{EquatorialPosition{11.0, 15.0}}},
	"LMi": ConstellationDetails{"Leo Minor", "Leonis Minoris", "LMi", LabelLocations{EquatorialPosition{10.0, 35.0}}},
	"Lep": ConstellationDetails{"Lepus", "Leporis", "Lep", LabelLocations{EquatorialPosition{5.5, -20.0}}},
	"Lib": ConstellationDetails{"Libra", "Librae", "Lib", LabelLocations{EquatorialPosition{15.25, -17.5}}},
	"Lup": ConstellationDetails{"Lupus", "Lupi", "Lup", LabelLocations{EquatorialPosition{15.0, -45.0}}},
	"Lyn": ConstellationDetails{"Lynx", "Lyncis", "Lyn", LabelLocations{EquatorialPosition{8.0, 45.0}}},
	"Lyr": ConstellationDetails{"Lyra", "Lyrae", "Lyr", LabelLocations{EquatorialPosition{19.0, 35.0}}},
	"Men": ConstellationDetails{"Mensa", "Mensae", "Men", LabelLocations{EquatorialPosition{5.5, -75.0}}},
	"Mic": ConstellationDetails{"Microscopium", "Microscopii", "Mic", LabelLocations{EquatorialPosition{20.75, -35.0}}},
	"Mon": ConstellationDetails{"Monoceros", "Monocerotis", "Mon", LabelLocations{EquatorialPosition{7.0, 0.0}}},
	"Mus": ConstellationDetails{"Musca", "Muscae", "Mus", LabelLocations{EquatorialPosition{12.0, -70.0}}},
	"Nor": ConstellationDetails{"Norma", "Normae", "Nor", LabelLocations{EquatorialPosition{16.0, -50.0}}},
	"Oct": ConstellationDetails{"Octans", "Octantis", "Oct", LabelLocations{EquatorialPosition{21.0, -80.0}}},
	"Oph": ConstellationDetails{"Ophiuchus", "Ophiuchi", "Oph", LabelLocations{EquatorialPosition{17.0, -5.0}}},
	"Ori": ConstellationDetails{"Orion", "Orionis", "Ori", LabelLocations{EquatorialPosition{5.5, 2.5}}},
	"Pav": ConstellationDetails{"Pavo", "Pavonis", "Pav", LabelLocations{EquatorialPosition{19.5, -65.0}}},
	"Peg": ConstellationDetails{"Pegasus", "Pegasi", "Peg", LabelLocations{EquatorialPosition{22.5, 20.0}}},
	"Per": ConstellationDetails{"Perseus", "Persei", "Per", LabelLocations{EquatorialPosition{3.5, 45.0}}},
	"Phe": ConstellationDetails{"Phoenix", "Phoenicis", "Phe", LabelLocations{EquatorialPosition{1.0, -50.0}}},
	"Pic": ConstellationDetails{"Pictor", "Pictoris", "Pic", LabelLocations{EquatorialPosition{5.5, -52.0}}},
	"Psc": ConstellationDetails{"Pisces", "Piscium", "Psc", LabelLocations{EquatorialPosition{0.5, 10.0}}},
	"PsA": ConstellationDetails{"Piscis Austrinus", "Piscis Austrini", "PsA", LabelLocations{EquatorialPosition{22.5, -30.0}}},
	"Pup": ConstellationDetails{"Puppis", "Puppis", "Pup", LabelLocations{EquatorialPosition{7.5, -35.0}}},
	"Pyx": ConstellationDetails{"Pyxis", "Pyxidis", "Pyx", LabelLocations{EquatorialPosition{9.0, -30.0}}},
	"Ret": ConstellationDetails{"Reticulum", "Reticuli", "Ret", LabelLocations{EquatorialPosition{4.0, -60.0}}},
	"Sge": ConstellationDetails{"Sagitta", "Sagittae", "Sge", LabelLocations{EquatorialPosition{19.75, 18.5}}},
	"Sgr": ConstellationDetails{"Sagittarius", "Sagittarii", "Sgr", LabelLocations{EquatorialPosition{19.25, -25.0}}},
	"Sco": ConstellationDetails{"Scorpius", "Scorpii", "Sco", LabelLocations{EquatorialPosition{16.5, -30.0}}},
	"Scl": ConstellationDetails{"Sculptor", "Sculptoris", "Scl", LabelLocations{EquatorialPosition{0.5, -30.0}}},
	"Sct": ConstellationDetails{"Scutum", "Scuti", "Sct", LabelLocations{EquatorialPosition{18.5, -10.0}}},
	"Ser": ConstellationDetails{"Serpens", "Serpentis", "Ser", LabelLocations{EquatorialPosition{15.5, 5.0}, EquatorialPosition{18.25, -2.0}}}, // Serpens Caput and Serpens Cauda
	"Sex": ConstellationDetails{"Sextans", "Sextantis", "Sex", LabelLocations{EquatorialPosition{10.5, -5.0}}},
	"Tau": ConstellationDetails{"Taurus", "Tauri", "Tau", LabelLocations{EquatorialPosition{4.5, 20.0}}},
	"Tel": ConstellationDetails{"Telescopium", "Telescopii", "Tel", LabelLocations{EquatorialPosition{19.0, -50.0}}},
	"Tri": ConstellationDetails{"Triangulum", "Trianguli", "Tri", LabelLocations{EquatorialPosition{2.0, 30.0}}},
	"TrA": ConstellationDetails{"Triangulum Australe", "Trianguli Australis", "TrA", LabelLocations{EquatorialPosition{16.75, -67.5}}},
	"Tuc": ConstellationDetails{"Tucana", "Tucanae", "Tuc", LabelLocations{EquatorialPosition{23.0, -60.0}}},
	"UMa": ConstellationDetails{"Ursa Major", "Ursae Majoris", "UMa", LabelLocations{EquatorialPosition{10.5, 55.0}}},
	"UMi": ConstellationDetails{"Ursa Minor", "Ursae Minoris", "UMi", LabelLocations{EquatorialPosition{16.0, 80.0}}},
	"Vel": ConstellationDetails{"Vela", "Velorum", "Vel", LabelLocations{EquatorialPosition{9.5, -45.0}}},
	"Vir": ConstellationDetails{"Virgo", "Virginis", "Vir", LabelLocations{EquatorialPosition{13.5, 0.0}}},
	"Vol": ConstellationDetails{"Volans", "Volantis", "Vol", LabelLocations{EquatorialPosition{8.0, -70.0}}},
	"Vul": ConstellationDetails{"Vulpecula", "Vulpeculae", "Vul", LabelLocations{EquatorialPosition{20.0, 25.0}}},
}

// GetNameForConstellation gets the full, official constellation name for the supplied constellation abbreviation [abbreviation].
func GetNameForConstellation(abbreviation string) string {
	result := ""
	item, exists := CONSTELLATION_DATA[abbreviation]
	if exists {
		result = item.Name
	}
	return result

}

// GetGenitiveForConstellation gets the Latin genitive form (e.g. "Centauri" for "Centaurus") for the supplied constellation abbreviation [abbreviation].
func GetGenitiveForConstellation(abbreviation string) string {
	result := ""
	item, exists := CONSTELLATION_DATA[abbreviation]
	if exists {
		result = item.Genitive
	}
	return result
}

// GetLabelLocationsForConstellation gets a list of one or more locations suggested for labeling the supplied constellation abbreviation [abbreviation].
func GetLabelLocationsForConstellation(abbreviation string) []EquatorialPosition {
	result := make([]EquatorialPosition, 0)
	item, exists := CONSTELLATION_DATA[abbreviation]
	if exists {
		result = item.LabelLocation
	}
	return result
}
