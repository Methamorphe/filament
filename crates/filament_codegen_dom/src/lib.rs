use filament_ir::TemplateIr;

pub fn generate_dom_module(template: &TemplateIr) -> String {
    format!(
        "// TODO: Rust DOM codegen will lower this IR.\n// html = {:?}\n",
        template.html
    )
}

