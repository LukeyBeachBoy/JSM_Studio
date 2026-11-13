#include "../JoyShockMapper/JoyShockMapper/include/ConsoleFeed.h"
#include <cstdlib>
#include <iostream>
void check(bool b) { if(!b) std::abort(); }
std::string encode(const std::string& s) { ConsoleFeed::tail.clear(); ConsoleFeed::append(s); return ConsoleFeed::json(); }
int main() {
    check(encode("a\n\"\\\t")=="\"a\\n\\\"\\\\\\t\"");
    check(encode(std::string("Windows ")+char(0x96)+" console")=="\"Windows \\ufffd console\"");
    const std::string unicode="\xc3\xa9 \xe2\x80\x93 \xf0\x9f\x8e\xae";
    check(encode(unicode)=="\""+unicode+"\"");
    for(const auto& bad:{std::string("\x80"),std::string("\xc0\xaf"),std::string("\xe0\x80\xaf"),std::string("\xed\xa0\x80"),std::string("\xf4\x90\x80\x80"),std::string("\xf0\x9f")}) {
        const auto result=encode(bad);
        for(unsigned char byte:result) check(byte<128);
        check(result.find("\\ufffd")!=std::string::npos);
    }
    check(encode("\xc3\xa9"+std::string(4095,'x')).starts_with("\"\\ufffd"));
    std::cout<<"Console telemetry preserves UTF-8 and safely replaces ANSI, malformed and truncated bytes\n";
}
