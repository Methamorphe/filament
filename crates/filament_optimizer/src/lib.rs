use filament_ir::TemplateIr;

pub fn optimize(template: TemplateIr) -> TemplateIr {
    // TODO: Introduce constant folding, ref compaction, and SSR/DOM specialization passes.
    template
}

