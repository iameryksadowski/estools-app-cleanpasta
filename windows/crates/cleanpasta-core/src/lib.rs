use rquickjs::{Context, Runtime};
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};

const BUNDLE: &str = include_str!("../../../../Resources/convert.js");
pub type Result<T> = std::result::Result<T, String>;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Options {
    pub replace_dashes: bool,
    pub replace_quotes: bool,
    pub font_size: u8,
}
impl Default for Options {
    fn default() -> Self {
        Self { replace_dashes: true, replace_quotes: true, font_size: 12 }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Content {
    pub html: String,
    pub text: String,
}

// Only the trusted bundle is evaluated. Clipboard content enters as JSON data.
fn evaluate(expression: &str) -> Result<String> {
    let runtime = Runtime::new().map_err(|e| e.to_string())?;
    runtime.set_memory_limit(64 * 1024 * 1024);
    runtime.set_max_stack_size(2 * 1024 * 1024);
    let deadline = Instant::now() + Duration::from_secs(3);
    runtime.set_interrupt_handler(Some(Box::new(move || Instant::now() >= deadline)));
    let context = Context::full(&runtime).map_err(|e| e.to_string())?;
    context.with(|ctx| {
        ctx.eval::<(), _>(BUNDLE).map_err(|e| format!("Converter load: {e:?}"))?;
        ctx.eval::<String, _>(expression).map_err(|e| {
            let exception = ctx.catch();
            format!("Converter failed: {e:?}: {exception:?}")
        })
    })
}
fn call(method: &str, input: serde_json::Value, options: &Options) -> Result<Option<Content>> {
    if options.font_size > 72 { return Err("font size must be from 0 to 72".into()); }
    let source = format!("JSON.stringify(Cleanpasta.{method}({}, {}))", input, serde_json::to_string(options).unwrap());
    let output = evaluate(&source)?;
    let result: Option<Content> = serde_json::from_str(&output).map_err(|e| e.to_string())?;
    Ok(result.filter(|r| !r.html.is_empty() || !r.text.trim().is_empty()))
}
pub fn convert(html: Option<&str>, text: Option<&str>, options: &Options) -> Result<Option<Content>> {
    if html.unwrap_or("").is_empty() && text.unwrap_or("").is_empty() { return Ok(None); }
    let mut input = serde_json::Map::new();
    if let Some(h) = html.filter(|v| !v.is_empty()) { input.insert("html".into(), h.into()); }
    if let Some(t) = text.filter(|v| !v.is_empty()) { input.insert("text".into(), t.into()); }
    call("cleanContent", input.into(), options)
}
pub fn markdown(text: &str, options: &Options) -> Result<Option<Content>> {
    if text.trim().is_empty() { return Ok(None); }
    call("cleanMarkdown", text.into(), options)
}
pub fn markdown_body(text: &str) -> Result<String> {
    let encoded = evaluate(&format!("JSON.stringify(Cleanpasta.markdownBody({}))", serde_json::to_string(text).unwrap()))?;
    serde_json::from_str(&encoded).map_err(|e| e.to_string())
}
