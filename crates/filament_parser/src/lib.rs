use filament_ir::TemplateIr;

#[derive(Debug, Default)]
pub struct ParseOutput {
    pub templates: Vec<TemplateIr>,
}

pub fn parse_module(_source: &str) -> ParseOutput {
    // TODO: Replace this stub with a real TSX parser and lowering pass.
    ParseOutput::default()
}

