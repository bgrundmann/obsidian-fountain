export default {
	input: "src/fountain_parser.peggy",
	output: "src/fountain_parser.js",
	dts: true,
	returnTypes: {
		parse: "FountainScript",
	},
};
