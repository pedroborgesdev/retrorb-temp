package romcode

import (
	"encoding/base64"
	"encoding/binary"
	"hash/crc32"
	"strings"
	"testing"
)

func TestEncodeDecode_AllProvidersAndCompressionRatio(t *testing.T) {
	tests := []struct {
		name     string
		source   string
		url      string
		index    int
		filename string
	}{
		{
			name:     "romsfun firered",
			source:   "romsfun",
			url:      "https://romsfun.com/roms/game-boy-advance/pokemon-fire-red.html",
			index:    0,
			filename: "Pokemon - FireRed Version (USA).zip",
		},
		{
			name:     "romspure god of war",
			source:   "romspure",
			url:      "https://romspure.cc/roms/playstation-2/god-of-war-ii-771/",
			index:    2,
			filename: "God of War II (USA).iso",
		},
		{
			name:     "romsgames firered",
			source:   "romsgames",
			url:      "https://www.romsgames.net/gameboy-advance-rom-pokemon-firered-version/",
			index:    0,
			filename: "Pokemon FireRed.zip",
		},
		{
			name:     "wowroms zelda",
			source:   "wowroms",
			url:      "https://wowroms.com/en/roms/nintendo-64/legend-of-zelda-the-ocarina-of-time/24505.html",
			index:    0,
			filename: "Legend of Zelda, The - Ocarina of Time (USA).zip",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			code, err := Encode(tt.source, tt.url, tt.index, tt.filename)
			if err != nil {
				t.Fatalf("Encode() error = %v", err)
			}
			if !strings.HasPrefix(code, Prefix) {
				t.Fatalf("expected prefix %q, got %q", Prefix, code)
			}

			decoded, err := Decode(code)
			if err != nil {
				t.Fatalf("Decode(%q) error = %v", code, err)
			}
			if decoded.Source != tt.source || decoded.GameURL != tt.url || decoded.FileIndex != tt.index || !decoded.HasFile {
				t.Fatalf("round-trip mismatch: got %+v, want source=%s url=%s index=%d", decoded, tt.source, tt.url, tt.index)
			}
			if decoded.FileHash != FilenameHash(tt.filename) {
				t.Fatalf("file hash mismatch: got %x, want %x", decoded.FileHash, FilenameHash(tt.filename))
			}

			naiveLen := len(Prefix) + base64.RawURLEncoding.EncodedLen(len(tt.source)+len(tt.url)+10)
			if len(code) >= naiveLen {
				t.Errorf("expected compact encoding shorter than naive (%d), got %d (%s)", naiveLen, len(code), code)
			}
			t.Logf("%s: len=%d (vs naive ~%d) -> %s", tt.name, len(code), naiveLen, code)
		})
	}
}

func TestDecode_RejectsCorruptTamperedAndUnsupportedCodes(t *testing.T) {
	code, err := Encode("romsfun", "https://romsfun.com/roms/game-boy-advance/pokemon-fire-red.html", 0, "Pokemon.zip")
	if err != nil {
		t.Fatalf("Encode() failed: %v", err)
	}

	// Flip last character to corrupt CRC16
	last := code[len(code)-1]
	replacement := "A"
	if last == 'A' {
		replacement = "B"
	}
	tampered := code[:len(code)-1] + replacement
	if _, err := Decode(tampered); err == nil {
		t.Fatal("expected CRC rejection for tampered code")
	}

	// Future version bits (bits 6..7 != 0) with valid CRC must still be rejected
	packet := []byte{0x40, 0x00, 0x11, 0x22, 'a', 'b', 'c'}
	crc := uint16(crc32.ChecksumIEEE(packet) & 0xFFFF)
	packet = append(packet, byte(crc>>8), byte(crc))
	v2 := Prefix + base64.RawURLEncoding.EncodeToString(packet)
	if _, err := Decode(v2); err == nil {
		t.Fatal("expected unsupported version error")
	}

	var _ = binary.MaxVarintLen64
	for _, bad := range []string{"", "RO2-abc", "RO1-!", Prefix + strings.Repeat("A", 600)} {
		if _, err := Decode(bad); err == nil {
			t.Errorf("expected Decode(%q) to fail", bad)
		}
	}
}
