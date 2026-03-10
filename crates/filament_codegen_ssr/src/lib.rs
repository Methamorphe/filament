use filament_ir::TemplateIr;

pub fn generate_ssr_module(template: &TemplateIr) -> String {
    format!(
        "// TODO: Rust SSR codegen will lower this IR.\n// html = {:?}\n",
        template.html
    )
}

