// Side-effect CSS imports shipped inside `@anvilkit/<component>/dist`
// (e.g. `import "./styles.css"`) need a type declaration so `tsc`
// does not flag them as TS2882 when it type-checks the bench files.
// At runtime the `bench/css-shim.loader.mjs` module hook routes
// these imports to an empty module.
declare module "*.css" {
	const content: string;
	export default content;
}
