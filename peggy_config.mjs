export default {
	input: "src/fountain/parser.peggy",
	output: "src/fountain/parser.js",
	dts: true,
	returnTypes: {
		Script: 'import("./script").FountainScript',
	},
};
