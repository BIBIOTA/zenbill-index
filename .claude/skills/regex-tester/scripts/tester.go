package main

import (
	"fmt"
	"os"
	"regexp"
)

// ZenBill Regex Tester
// 用於測試 Rule Engine 的 Regex Pattern 是否能正確匹配商家名稱

func main() {
	if len(os.Args) < 3 {
		printUsage()
		os.Exit(1)
	}

	pattern := os.Args[1]
	text := os.Args[2]

	printHeader(pattern, text)

	// 編譯 Regex
	re, err := regexp.Compile(pattern)
	if err != nil {
		printError(err)
		os.Exit(1)
	}

	// 測試匹配
	matched := re.MatchString(text)

	if matched {
		printSuccess(re, text, pattern)
		os.Exit(0)
	} else {
		printNoMatch()
		os.Exit(1)
	}
}

func printUsage() {
	fmt.Println("🧪 ZenBill Regex Tester")
	fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	fmt.Println()
	fmt.Println("Usage: go run tester.go <pattern> <text>")
	fmt.Println()
	fmt.Println("Examples:")
	fmt.Println(`  go run tester.go "^7-11.*" "7-11 Dunhua Store"`)
	fmt.Println(`  go run tester.go "(?i)uber\\s*eats" "UBER EATS - Food Delivery"`)
	fmt.Println(`  go run tester.go "全家.*" "全家便利商店 台北店"`)
	fmt.Println()
	fmt.Println("Common Patterns:")
	fmt.Println("  ^7-11.*           → Starts with '7-11'")
	fmt.Println("  (?i)starbucks     → Case-insensitive 'starbucks'")
	fmt.Println("  全家.*            → Starts with '全家'")
	fmt.Println("  .*uber\\s*eats.*  → Contains 'uber eats' (flexible spacing)")
}

func printHeader(pattern, text string) {
	fmt.Println("🧪 Regex Tester for ZenBill Rule Engine")
	fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	fmt.Printf("Pattern: %s\n", pattern)
	fmt.Printf("Text:    %s\n", text)
	fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
}

func printError(err error) {
	fmt.Println()
	fmt.Printf("❌ Invalid Regex Pattern: %v\n", err)
	fmt.Println()
	fmt.Println("💡 Common Regex patterns for ZenBill:")
	fmt.Println("   ^7-11.*           → Starts with '7-11'")
	fmt.Println("   (?i)starbucks     → Case-insensitive 'starbucks'")
	fmt.Println("   全家.*            → Starts with '全家'")
	fmt.Println("   (?i)uber\\s*eats  → Case-insensitive 'uber eats' (flexible spacing)")
	fmt.Println()
	fmt.Println("🔧 Regex Syntax:")
	fmt.Println("   .   → Any character")
	fmt.Println("   *   → 0 or more times")
	fmt.Println("   +   → 1 or more times")
	fmt.Println("   \\s  → Whitespace")
	fmt.Println("   (?i) → Case insensitive")
	fmt.Println("   ^   → Start of string")
	fmt.Println("   $   → End of string")
}

func printSuccess(re *regexp.Regexp, text, pattern string) {
	fmt.Println()
	fmt.Println("✅ MATCH!")

	// 顯示匹配的部分
	matches := re.FindStringSubmatch(text)
	if len(matches) > 0 {
		fmt.Printf("   Matched: '%s'\n", matches[0])
	}

	// 顯示所有匹配（如果有多個）
	allMatches := re.FindAllString(text, -1)
	if len(allMatches) > 1 {
		fmt.Println("   All matches:")
		for i, match := range allMatches {
			fmt.Printf("     %d. '%s'\n", i+1, match)
		}
	}

	fmt.Println()
	fmt.Println("💡 This pattern can be added to rule_engine.go:")
	fmt.Printf("   {Pattern: `%s`, NormalizedName: \"<商家名稱>\"}\n", pattern)
	fmt.Println()
	fmt.Println("🔜 Next steps:")
	fmt.Println("   1. Test with more variations of merchant names")
	fmt.Println("   2. Add the rule to internal/usecase/rule_engine.go")
	fmt.Println("   3. Run tests: go test ./internal/usecase/...")
	fmt.Println("   4. Use lint-check to verify code quality")
}

func printNoMatch() {
	fmt.Println()
	fmt.Println("❌ NO MATCH")
	fmt.Println()
	fmt.Println("💡 Tips:")
	fmt.Println("   - Use (?i) for case-insensitive matching")
	fmt.Println("   - Use .* to match any characters")
	fmt.Println("   - Use \\s* for flexible whitespace (0 or more)")
	fmt.Println("   - Use \\s+ for required whitespace (1 or more)")
	fmt.Println("   - Escape special chars: \\. \\( \\) \\$")
	fmt.Println("   - Test with real invoice data for accuracy")
	fmt.Println()
	fmt.Println("🔧 Debug suggestions:")
	fmt.Println("   - Try adding .* at the end: pattern.*")
	fmt.Println("   - Try case-insensitive: (?i)pattern")
	fmt.Println("   - Try flexible spacing: pattern\\s*word")
	fmt.Println()
	fmt.Println("📖 Run without args to see usage examples")
}
