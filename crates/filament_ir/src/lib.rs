#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TemplateIr {
    pub html: String,
    pub node_refs: Vec<String>,
    pub anchor_refs: Vec<String>,
    pub bindings: Vec<DynamicBinding>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DynamicBinding {
    pub kind: DynamicBindingKind,
    pub target_ref: String,
    pub name: Option<String>,
    pub expression: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DynamicBindingKind {
    Insert,
    Attribute,
    Event,
}

impl TemplateIr {
    pub fn empty() -> Self {
        Self {
            html: String::new(),
            node_refs: Vec::new(),
            anchor_refs: Vec::new(),
            bindings: Vec::new(),
        }
    }
}

