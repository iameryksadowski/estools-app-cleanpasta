use cleanpasta_core::{convert, markdown, markdown_body};
use cleanpasta_platform as platform;
use std::io::{IsTerminal, Read};
const HELP: &str = "ES Tools Cleanpasta 1.1.1
Usage: cleanpasta [FILE] [options]
Input: FILE, piped stdin, or clipboard. '-' reads stdin.
  --markdown, --md     Markdown (automatic for .md/.markdown)
  --html              HTML (automatic for .html/.htm)
  --text              Plain text with Markdown detection
  --json-input        JSON object with html and/or text
  --body              Skip front matter and notes after first ---
  --copy              Write HTML and Unicode text to clipboard
  --paste             Copy and press Ctrl+V after releasing modifiers
  --repair            Clean clipboard in place
  --print FORMAT      html (default), text or json; explicit with copy/paste/repair
  --keep-dashes       Keep long dashes
  --keep-quotes       Keep typographic quotes
  --font-size N       0-72 px, 0 uses target size; default: app setting (12)
  --version, -v       Version
  --help, -h          This help
Exit codes: 0 done, 1 usage/read/clipboard error, 2 nothing to clean,
3 copied but SendInput could not paste (e.g. elevated target).
";
#[derive(Clone, Copy, PartialEq)]
enum Kind {
    Auto,
    Markdown,
    Html,
    Text,
    Json,
}
fn run() -> Result<(), (i32, String)> {
    let error = |message: String| (1, message);
    let mut options = platform::settings().map_err(error)?.options;
    let (mut kind, mut file, mut body, mut copy, mut paste, mut repair, mut output) = (
        Kind::Auto,
        None::<String>,
        false,
        false,
        false,
        false,
        None::<String>,
    );
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--help" | "-h" => {
                print!("{HELP}");
                return Ok(());
            }
            "--version" | "-v" => {
                println!("{}", env!("CARGO_PKG_VERSION"));
                return Ok(());
            }
            "--markdown" | "--md" => kind = Kind::Markdown,
            "--html" => kind = Kind::Html,
            "--text" => kind = Kind::Text,
            "--json-input" => kind = Kind::Json,
            "--body" => body = true,
            "--copy" => copy = true,
            "--paste" => paste = true,
            "--repair" => repair = true,
            "--keep-dashes" => options.replace_dashes = false,
            "--keep-quotes" => options.replace_quotes = false,
            "--print" => {
                output = Some(
                    args.next()
                        .filter(|s| ["html", "text", "json"].contains(&s.as_str()))
                        .ok_or_else(|| error("--print needs html, text or json".into()))?,
                );
            }
            "--font-size" => {
                options.font_size = args
                    .next()
                    .and_then(|s| s.parse::<u8>().ok())
                    .filter(|n| *n <= 72)
                    .ok_or_else(|| error("--font-size needs a number from 0 to 72".into()))?;
            }
            _ => {
                if arg.starts_with('-') && arg != "-" {
                    return Err(error(format!("unknown option {arg} (see --help)")));
                }
                if file.replace(arg).is_some() {
                    return Err(error("only one FILE".into()));
                }
            }
        }
    }
    if repair && file.is_some() {
        return Err(error(
            "--repair works on the clipboard, not on a FILE".into(),
        ));
    }
    let content = if let Some(name) = file.as_deref().filter(|s| *s != "-") {
        let source =
            std::fs::read_to_string(name).map_err(|e| error(format!("cannot read {name}: {e}")))?;
        if kind == Kind::Auto {
            kind = match std::path::Path::new(name)
                .extension()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_lowercase()
                .as_str()
            {
                "md" | "markdown" => Kind::Markdown,
                "html" | "htm" => Kind::Html,
                _ => Kind::Text,
            };
        }
        Some(source)
    } else if !repair && (file.as_deref() == Some("-") || !std::io::stdin().is_terminal()) {
        let mut bytes = Vec::new();
        std::io::stdin()
            .read_to_end(&mut bytes)
            .map_err(|e| error(e.to_string()))?;
        Some(String::from_utf8_lossy(&bytes).into_owned())
    } else {
        None
    };
    let mut input = if let Some(source) = content {
        match kind {
            Kind::Html => platform::ClipboardContent {
                html: Some(source),
                text: None,
            },
            Kind::Json => {
                let value: serde_json::Value = serde_json::from_str(&source)
                    .map_err(|_| error("--json-input needs a JSON object".into()))?;
                if !value.is_object() {
                    return Err(error("--json-input needs a JSON object".into()));
                }
                platform::ClipboardContent {
                    html: value["html"].as_str().map(str::to_owned),
                    text: value["text"].as_str().map(str::to_owned),
                }
            }
            _ => platform::ClipboardContent {
                html: None,
                text: Some(source),
            },
        }
    } else {
        let mut input = platform::read_clipboard().map_err(error)?;
        match kind {
            Kind::Html => input.text = None,
            Kind::Markdown | Kind::Text => input.html = None,
            _ => {}
        }
        input
    };
    if body {
        if let Some(text) = input.text {
            input.text = Some(markdown_body(&text).map_err(error)?);
        }
    }
    let result = if kind == Kind::Markdown {
        markdown(input.text.as_deref().unwrap_or(""), &options)
    } else {
        convert(input.html.as_deref(), input.text.as_deref(), &options)
    }
    .map_err(error)?
    .ok_or_else(|| (2, "nothing to clean".into()))?;
    if copy || paste || repair {
        platform::write_clipboard(&result).map_err(error)?;
    }
    if output.is_some() || !(copy || paste || repair) {
        match output.as_deref().unwrap_or("html") {
            "json" => println!("{}", serde_json::to_string(&result).unwrap()),
            "text" => {
                print!("{}", result.text);
                if !result.text.ends_with('\n') {
                    println!();
                }
            }
            _ => println!(
                "{}",
                if result.html.is_empty() {
                    &result.text
                } else {
                    &result.html
                }
            ),
        }
    }
    if paste {
        platform::paste().map_err(|e| (3, format!("copied, but pasting failed: {e}")))?;
    }
    Ok(())
}
fn main() {
    if let Err((code, message)) = run() {
        eprintln!("cleanpasta: {message}");
        std::process::exit(code);
    }
}
