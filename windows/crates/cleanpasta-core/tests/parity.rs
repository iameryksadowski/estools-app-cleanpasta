use cleanpasta_core::{convert, markdown, markdown_body, Content, Options};
use serde::Deserialize;
#[derive(Deserialize)]
struct Input {
    html: Option<String>,
    text: Option<String>,
}
#[derive(Deserialize)]
struct Case {
    name: String,
    input: Input,
    options: Options,
    expected: Content,
    #[serde(default)]
    markdown: bool,
    #[serde(default)]
    body: bool,
}
#[test]
fn exact_typescript_parity_matrix() {
    let cases: Vec<Case> = serde_json::from_str(include_str!("parity.json")).unwrap();
    assert_eq!(cases.len(), 18);
    for case in cases {
        let text = if case.body {
            markdown_body(case.input.text.as_deref().unwrap()).unwrap()
        } else {
            case.input.text.unwrap_or_default()
        };
        let result = if case.markdown {
            markdown(&text, &case.options)
        } else {
            convert(case.input.html.as_deref(), Some(&text), &case.options)
        };
        assert_eq!(result.unwrap(), Some(case.expected), "{}", case.name);
    }
}
#[test]
fn empty_and_hostile_input() {
    assert_eq!(convert(None, None, &Options::default()).unwrap(), None);
    assert_eq!(
        convert(None, Some("  \n"), &Options::default()).unwrap(),
        None
    );
    let result = convert(
        Some("<script>throw 1</script><p>Safe</p>"),
        None,
        &Options::default(),
    )
    .unwrap()
    .unwrap();
    assert_eq!(result.text, "Safe\n");
    assert!(convert(
        None,
        Some("x"),
        &Options {
            font_size: 73,
            ..Options::default()
        }
    )
    .is_err());
}
