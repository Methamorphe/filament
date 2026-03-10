use filament_codegen_dom::generate_dom_module;
use filament_codegen_ssr::generate_ssr_module;
use filament_ir::TemplateIr;
use filament_optimizer::optimize;
use filament_parser::parse_module;

fn main() {
    let parsed = parse_module("<App />");
    let template = parsed
        .templates
        .into_iter()
        .next()
        .map(optimize)
        .unwrap_or_else(TemplateIr::empty);

    println!("filament_cli placeholder");
    println!("{}", generate_dom_module(&template));
    println!("{}", generate_ssr_module(&template));
}

