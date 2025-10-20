// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { DocumentSymbol } from 'vscode';
import * as fs from 'fs';
import * as path from 'path';


// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated

    // Symbol (Outline) provider for parameter files
    context.subscriptions.push(
        vscode.languages.registerDocumentSymbolProvider(
            { scheme: "file", language: "prodimoparam" },
            new ParameterDocumentSymbolProvider()
        )
    );

    // Completion provider for parameter names
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            { scheme: 'file', language: 'prodimoparam' },
            new ParameterNameCompletionProvider(context),
            '!', '.' // Optional: trigger character(s)
        )
    );

    // Hover provider for parameter descriptions
    context.subscriptions.push(
        vscode.languages.registerHoverProvider('prodimoparam', new ParameterHoverProvider(context))
    );

    // Symbol (Outline) provider for ProDiMo log files
    context.subscriptions.push(
        vscode.languages.registerDocumentSymbolProvider(
            { scheme: "file", language: "prodimolog" },
            new LogDocumentSymbolProvider()
        )
    );
}

/**
 * Provides completion items for parameter names and boolean literals for a custom language.
 *
 * This CompletionItemProvider:
 * - Reads parameter metadata from a JSON file (paramlist.json) located via the extension context.
 * - Supports two trigger flows:
 *   - Trigger by '!' (triggerKind === 1 or simulated when Ctrl+Space finds a preceding '!'): provides parameter name completions
 *     with variants that assume the '!' is already present or that prepend the '!' when invoked via Ctrl+Space.
 *   - Trigger by '.' (context.triggerCharacter === "."): provides only the boolean literals ".true." and ".false."
 *     (special-case for inline switch values).
 * - Avoids offering completions when another '!' is already present later or earlier on the same line.
 * - Appends unit and description snippets when the cursor is at end-of-line.
 * - Caches two lists of completion items (one for the Ctrl+Space scenario and one for the '!' trigger) to avoid rebuilding
 *   the lists on every invocation.
 *
 * Remarks:
 * - The provider synchronously reads and parses paramlist.json on the first non-cached request. File I/O may throw if the
 *   file is missing or malformed.
 * - The implementation mutates the parsed param objects by normalizing null descriptions to empty strings.
 * - CompletionItem.detail and documentation are populated (documentation is a MarkdownString containing type/default/unit metadata).
 * - Insert text is built to include spacing, optional unit/description when applicable, and for '.'-triggered booleans the
 *   inserted text is the boolean token (e.g. "true. ").
 *
 * Example behavior:
 * - Typing '!' then invoking completion will suggest parameter names (prefixed by a space in the inserted text).
 * - Pressing Ctrl+Space on a line that already contains a solitary '!' will suggest the same parameter completions but
 *   with the '!' included in the inserted text.
 * - Typing '.' and invoking completion (without an intervening '!') will suggest only .true. and .false..
 *
 * Constructor:
 * @param context - The extension context used to resolve the absolute path to paramlist.json.
 *
 * Method: provideCompletionItems(document, position, token, context)
 * @param document - The TextDocument in which completion was requested.
 * @param position - The Position at which completion was requested.
 * @param token - A CancellationToken indicating request cancellation.
 * @param context - The CompletionContext containing triggerKind and triggerCharacter information.
 * @returns An array of vscode.CompletionItem objects (or an empty array) appropriate for the current line state and trigger.
 *
 * Side effects:
 * - Reads and parses paramlist.json when needed.
 * - Caches generated completion item arrays on the instance (completionItems0 and completionItems1).
 * - May throw on file read/JSON parse errors.
 *
 * Private fields (summary):
 * - paramListPath: resolved path to paramlist.json.
 * - completionItems0: cached items for Ctrl+Space (and equivalent) triggers.
 * - completionItems1: cached items for explicit '!' triggers.
 */
class ParameterNameCompletionProvider implements vscode.CompletionItemProvider {
    private paramList: { [key: string]: { desc: string | null; type: string; default: string; unit: string } } = {};
    private completionItems0: vscode.CompletionItem[];
    private completionItems1: vscode.CompletionItem[];
    constructor(private context: vscode.ExtensionContext) {
        this.paramList = JSON.parse(fs.readFileSync(context.asAbsolutePath('paramlist.json'), 'utf8'));
        this.completionItems0 = [];
        this.completionItems1 = [];
    }

    // TODO: to make the code clearer, we could simply build all two or three lists at the beginning (when they are still empty. And the rest of the code just selects the list.)

    provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext) {
        // Return an array of CompletionItem objects
        let completionItems = [];

        const line = document.lineAt(position);
        // special case case for .true. and .false.
        if (context.triggerCharacter === ".") {
            if (line.text.substring(0, position.character).includes('!')) {
                return []; // ! in line so value is not expected here
            }
            else {
                // only suggest .true. and .false.
                // TODO: could be improved, one could already suggest .true.    ! paramnames
                // kind of keeping another list for the switches 
                var item = new vscode.CompletionItem('.true.', vscode.CompletionItemKind.Value);
                item.insertText = 'true. ';
                completionItems.push(item);
                item = new vscode.CompletionItem('.false.', vscode.CompletionItemKind.Value);
                item.insertText = 'false.     ';
                completionItems.push(item);
                return completionItems;
            }
        }

        // trigger kinds: 0 pressed ctrl+space , 1 pressed !;  

        // character is the index of the position in the line
        let endofline = (position.character === line.range.end.character);
        let triggerKind = context.triggerKind;
        const textBeforeCursor = line.text.substring(0, position.character);
        const lastTriggerPos = textBeforeCursor.lastIndexOf('!');
        // case were we have triggerKind 0, but ! is in the line, so we want to trigger as if ! was pressed
        if (triggerKind === 0 && lastTriggerPos >= 0) { // only if we have a ! in the line
            if ((line.text.substring(lastTriggerPos + 1).trim().length === 0)) { // only spaces after ! so it is fine
                triggerKind = 1;
            }
            else {
                return []; // something else after ! we stop
            }
        }

        if (triggerKind === 0) {
            // pressed ctrl+space ... suggest the parameters with ! so it is fine to have no ! in the line
            //if (lastTriggerPos === -1) {
            //    return []; // no trigger char found, no completion
            //}
            if (line.text.substring(0, lastTriggerPos).includes('!')) {
                return []; // another ! found, no completion
            }
            // have already filled it
            //if (this.completionItems0.length > 0) {
            //    return this.completionItems0;
            //}
        }
        else if (triggerKind === 1) {
            if (context.triggerKind !== 0) { // if this is zero special case trigger was not ! but we are in a situation like !kaslj;lkfj
                if (position.character - 1 !== 0 && line.text.substring(0, position.character - 1).includes('!')) {
                    return []; // another ! found, no completion
                }
            }
            if (line.text.substring(position.character).includes('!')) {
                return []; // another ! found, no completion
            }
            //if (this.completionItems1.length > 0) {
            //    return this.completionItems1;
            //}
        }

        // need to create the list
        for (const paramname of Object.keys(this.paramList)) {
            const param = this.paramList[paramname];

            if (param.desc === null) {
                param.desc = "";
            }

            let insertText = '';
            let name = ' ' + paramname; // default: triggered by !
            if (triggerKind === 0) {  // not triggered by ! but has ! in line, ist already checked before
                name = '! ' + paramname;
            }
            insertText += name + ' ';

            const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Variable);

            // the lists are only created once, so we would have to store the list with and without the endofline info
            if (endofline) {
                if (param.unit) {
                    insertText += "   [" + param.unit + "] ";
                }
                if (param.desc.trim() !== "") {
                    insertText += "   : " + param.desc;
                }
            }

            //item.detail = param.type;
            item.detail = param.desc + "\n";
            item.documentation = new vscode.MarkdownString(`- **Type:** ${param.type}\n- **Default:** ${param.default}\n- **Unit:** [${param.unit}]`);
            item.insertText = insertText;
            completionItems.push(item);
        }
        // store the lists, not sure if this is good style, but it seems unnecessary to create it again and again
        if (triggerKind === 0) {
            // also explicitly add .true. and .false. to the list
            completionItems.push(new vscode.CompletionItem('.true.', vscode.CompletionItemKind.Value));
            completionItems.push(new vscode.CompletionItem('.false.', vscode.CompletionItemKind.Value));
            //this.completionItems0 = completionItems;
        }
        else if (triggerKind === 1) {
            //this.completionItems1 = completionItems;
        }
        return completionItems;
    }
}


class ParameterDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
    public provideDocumentSymbols(
        document: vscode.TextDocument,
        token: vscode.CancellationToken): Promise<vscode.DocumentSymbol[]> {
        return new Promise((resolve, reject) => {
            const symbols: vscode.DocumentSymbol[] = [];
            const nodes = [symbols];

            for (let line = 0; line < document.lineCount; line++) {
                const textLine = document.lineAt(line);
                var regex = new RegExp('(^----*) \\b(\\S.*)\\b (----*)$');
                var result = regex.exec(textLine.text);
                if (result) {
                    const symbol = new DocumentSymbol(result[2], "block", vscode.SymbolKind.Method, textLine.range, textLine.range);
                    symbols.push(symbol);
                }
            }
            resolve(symbols);
        });
    }
};

class ParameterHoverProvider implements vscode.HoverProvider {
    private paramList: { [key: string]: { desc: string; unit: string; wiki: string[] } };

    constructor(private context: vscode.ExtensionContext) {
        // Load the parameter list from the JSON file
        this.paramList = JSON.parse(fs.readFileSync(context.asAbsolutePath('paramlist.json'), 'utf8'));
    }

    provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken): vscode.ProviderResult<vscode.Hover> {

        const wikiBaseUrl = "https://prodimowiki.readthedocs.io/en/latest/";


        const elements = document.lineAt(position).text.split("! ");
        if (elements.length !== 2) {
            return;
        }
        // if the position of the ! is beyond the cursor, I am not on the param name
        if (elements[0].length > position.character) {
            return;
        }


        const paramName = elements[1].trim().split(" ")[0];
        if (!paramName) {
            return;
        }
        // I am beyond the param name
        if (paramName.length + elements[0].length + 2 < position.character) {
            return;
        }

        const paramInfo = this.paramList[paramName];
        if (!paramInfo) {
            return;
        }

        var hovertxt = paramInfo.desc + "\n\n";
        if (paramInfo.unit && paramInfo.unit.trim() !== "") {
            hovertxt += "**Unit:** " + paramInfo.unit + "\n\n";
        }
        hovertxt += "**Wiki pages:**\n\n";
        for (const wiki of paramInfo.wiki) {
            hovertxt += "- [" + wiki.replace(".md", "") + "](" + wikiBaseUrl + wiki.replace(".md", ".html") + ")\n";
        }

        return {
            contents: [hovertxt]
        };
    }
};

class LogDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
    public provideDocumentSymbols(
        document: vscode.TextDocument,
        token: vscode.CancellationToken): Promise<vscode.DocumentSymbol[]> {
        return new Promise((resolve, reject) => {
            const symbols: vscode.DocumentSymbol[] = [];

            // TODO: could probably only use one hook variable
            let heatcoolHook: DocumentSymbol | undefined = undefined;
            let chemistryHook: DocumentSymbol | undefined = undefined;
            let contRTHook: DocumentSymbol | undefined = undefined;

            symbols.push(new DocumentSymbol("INIT", "section", vscode.SymbolKind.Class, new vscode.Range(0, 0, 0, 0), new vscode.Range(0, 0, 0, 0)));

            // Regex for the INIT sections
            var regexInit = new RegExp('^ {0,1}(INIT_[a-z0-9_]*)(?::|[ ])', 'i');

            for (let line = 0; line < document.lineCount; line++) {
                const textLine = document.lineAt(line);

                if (chemistryHook) {
                    if (textLine.text.startsWith("   max element conservation error   :")) {
                        symbols.push(new DocumentSymbol("CHEMISTRY END", "", vscode.SymbolKind.Class, textLine.range, textLine.range));
                        chemistryHook = undefined;
                    }
                }
                else if (contRTHook) {
                    if (textLine.text.startsWith(" RT total time=")) {
                        symbols.push(new DocumentSymbol("CONTINUUM RT END", "", vscode.SymbolKind.Class, textLine.range, textLine.range));
                        contRTHook = undefined;
                    }
                }

                var result = regexInit.exec(textLine.text);
                if (result) {
                    var sym = new DocumentSymbol(result[1], "", vscode.SymbolKind.Method, textLine.range, textLine.range);
                    symbols[0].children.push(sym);
                    if (result[1] === "INIT_HEATCOOL") {
                        heatcoolHook = sym;
                    }
                    else {
                        heatcoolHook = undefined;
                    }
                }
                if (heatcoolHook) {
                    const res = new RegExp("^ *(INIT SYS \\S*) ...").exec(textLine.text);
                    if (res) {
                        heatcoolHook.children.push(new DocumentSymbol(res[1], "", vscode.SymbolKind.Variable, textLine.range, textLine.range));
                    }
                }
                if (textLine.text.startsWith(" total INIT CPU time")) {
                    symbols[0].children.push(new DocumentSymbol("INIT END", "", vscode.SymbolKind.Method, textLine.range, textLine.range));
                }
                else if (textLine.text.startsWith(" CALCULATING MONOCHROMATIC FACE-ON SED ...")) {
                    symbols.push(new DocumentSymbol("SED", "", vscode.SymbolKind.Class, textLine.range, textLine.range));
                }
                else if (textLine.text.startsWith(" CHEMISTRY AND ENERGY BALANCE ...")) {
                    chemistryHook = new DocumentSymbol("CHEMISTRY START", "", vscode.SymbolKind.Class, textLine.range, textLine.range);
                    symbols.push(chemistryHook);
                }
                else if (textLine.text.startsWith(" SOLUTION OF CONTINUUM RADIATIVE TRANSFER ...")) {
                    contRTHook = new DocumentSymbol("CONTINUUM RT START", "", vscode.SymbolKind.Class, textLine.range, textLine.range);
                    symbols.push(contRTHook);
                }
                else if (textLine.text.startsWith(" Starting line ray-tracing...")) {
                    symbols.push(new DocumentSymbol("LINE TRANSFER", "", vscode.SymbolKind.Class, textLine.range, textLine.range));
                }
            }
            resolve(symbols);
        });
    }
};

// This method is called when your extension is deactivated
export function deactivate() { }
