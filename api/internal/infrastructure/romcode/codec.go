package romcode

import (
	"bytes"
	"compress/flate"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"hash/crc32"
	"io"
	"net/url"
	"strings"

	"retromancy/api/internal/domain"
	"retromancy/api/internal/infrastructure/htmlutil"
	"retromancy/api/internal/infrastructure/netsec"
)

const (
	// Prefix identifies v1 compact RetroOrb ROM reference codes.
	Prefix              = "RO1-"
	flagCompressed      = uint8(1 << 2)
	flagHasSuffix       = uint8(1 << 3)
	flagHasPrefix       = uint8(1 << 4)
	flagHasFile         = uint8(1 << 5)
	flagVersionMask     = uint8(0xC0)
	maxEncodedLength    = 512
	maxDecompressedSize = 2048
)

var presetDict = []byte(
	"game-boy-advance/playstation-2/nintendo-ds/super-nintendo/nintendo-64/" +
		"playstation-portable/nintendo-game-boy/gameboy-advance/sega-genesis/" +
		"nintendo-3ds/playstation/nintendo-gameboy/gamecube/nintendo-wii/" +
		"pokemon-super-mario-zelda-sonic-dragon-ball-final-fantasy-resident-evil-" +
		"god-of-war-grand-theft-auto-metal-gear-castlevania-metroid-kirby-donkey-kong-" +
		"crash-bandicoot-street-fighter-mortal-kombat-mega-man-need-for-speed-" +
		"-version-usa-europe-japan-rev-1-rom-.html",
)

type providerSpec struct {
	ID         uint8
	Source     string
	Host       string
	Domain     string
	PathPrefix string
	PathSuffix string
}

var specsByID = [4]providerSpec{
	{ID: 0, Source: "romsfun", Host: "romsfun.com", Domain: "romsfun.com", PathPrefix: "roms/", PathSuffix: ".html"},
	{ID: 1, Source: "romspure", Host: "romspure.cc", Domain: "romspure.cc", PathPrefix: "roms/", PathSuffix: "/"},
	{ID: 2, Source: "romsgames", Host: "www.romsgames.net", Domain: "romsgames.net", PathPrefix: "", PathSuffix: "/"},
	{ID: 3, Source: "wowroms", Host: "wowroms.com", Domain: "wowroms.com", PathPrefix: "en/roms/", PathSuffix: ".html"},
}

var specsBySource = map[string]providerSpec{
	"romsfun":   specsByID[0],
	"romspure":  specsByID[1],
	"romsgames": specsByID[2],
	"wowroms":   specsByID[3],
}

// DecodedRef represents the parsed identity extracted from a compact RO1 code.
type DecodedRef struct {
	Code      string
	Source    string
	GameURL   string
	FileIndex int
	HasFile   bool
	FileHash  [2]byte
}

// FilenameHash computes a stable 16-bit digest of a normalized ROM filename.
func FilenameHash(filename string) [2]byte {
	sanitized := strings.ToLower(netsec.SanitizeFilename(&filename, "download.zip"))
	sum := sha256.Sum256([]byte(sanitized))
	return [2]byte{sum[0], sum[1]}
}

// Encode packs provider, relative game path, file index, and filename digest into RO1-...
func Encode(source, gameURL string, fileIndex int, filename string) (string, error) {
	spec, ok := specsBySource[source]
	if !ok {
		return "", domain.BadRequest("Fonte inválida.")
	}
	if !htmlutil.ValidateGameURL(gameURL, spec.Domain) {
		return "", domain.BadRequest("URL inválida para esta fonte.")
	}
	if fileIndex < 0 {
		return "", domain.BadRequest("Arquivo inválido.")
	}

	parsed, err := url.Parse(gameURL)
	if err != nil {
		return "", domain.BadRequest("URL inválida para esta fonte.")
	}
	rel := strings.TrimPrefix(parsed.EscapedPath(), "/")
	if parsed.RawQuery != "" {
		rel += "?" + parsed.RawQuery
	}

	flags := spec.ID & 0x03
	if spec.PathPrefix != "" && strings.HasPrefix(rel, spec.PathPrefix) {
		rel = strings.TrimPrefix(rel, spec.PathPrefix)
		flags |= flagHasPrefix
	}
	if spec.PathSuffix != "" && strings.HasSuffix(rel, spec.PathSuffix) {
		rel = strings.TrimSuffix(rel, spec.PathSuffix)
		flags |= flagHasSuffix
	}

	rawPath := []byte(rel)
	pathPayload := rawPath
	if deflated, err := compressWithDict(rawPath); err == nil && len(deflated) < len(rawPath) {
		pathPayload = deflated
		flags |= flagCompressed
	}

	flags |= flagHasFile
	var idxBuf [binary.MaxVarintLen64]byte
	idxLen := binary.PutUvarint(idxBuf[:], uint64(fileIndex))
	fileHash := FilenameHash(filename)

	totalLen := 1 + idxLen + 2 + len(pathPayload) + 2
	packet := make([]byte, 0, totalLen)
	packet = append(packet, flags)
	packet = append(packet, idxBuf[:idxLen]...)
	packet = append(packet, fileHash[0], fileHash[1])
	packet = append(packet, pathPayload...)

	crc := uint16(crc32.ChecksumIEEE(packet) & 0xFFFF)
	packet = append(packet, byte(crc>>8), byte(crc))

	return Prefix + base64.RawURLEncoding.EncodeToString(packet), nil
}

// Decode validates checksum, unpacks the binary payload, and reconstructs the verified game URL.
func Decode(code string) (DecodedRef, error) {
	trimmed := strings.TrimSpace(code)
	if !strings.HasPrefix(trimmed, Prefix) || len(trimmed) > maxEncodedLength {
		return DecodedRef{}, domain.BadRequest("Código de ROM inválido.")
	}
	rawPacket, err := base64.RawURLEncoding.DecodeString(strings.TrimPrefix(trimmed, Prefix))
	if err != nil || len(rawPacket) < 5 {
		return DecodedRef{}, domain.BadRequest("Código de ROM inválido.")
	}

	bodyLen := len(rawPacket) - 2
	body := rawPacket[:bodyLen]
	wantCRC := uint16(rawPacket[bodyLen])<<8 | uint16(rawPacket[bodyLen+1])
	gotCRC := uint16(crc32.ChecksumIEEE(body) & 0xFFFF)
	if wantCRC != gotCRC {
		return DecodedRef{}, domain.BadRequest("Código de ROM inválido ou corrompido.")
	}

	flags := body[0]
	if flags&flagVersionMask != 0 {
		return DecodedRef{}, domain.BadRequest("Versão do código de ROM não suportada.")
	}

	spec := specsByID[flags&0x03]
	cursor := 1
	fileIndex := 0
	hasFile := (flags & flagHasFile) != 0
	var fileHash [2]byte
	if hasFile {
		parsedIdx, readBytes := binary.Uvarint(body[cursor:])
		if readBytes <= 0 || parsedIdx > 10_000 {
			return DecodedRef{}, domain.BadRequest("Código de ROM inválido.")
		}
		fileIndex = int(parsedIdx)
		cursor += readBytes
		if cursor+2 >= len(body) {
			return DecodedRef{}, domain.BadRequest("Código de ROM inválido.")
		}
		fileHash = [2]byte{body[cursor], body[cursor+1]}
		cursor += 2
	}

	pathBytes := body[cursor:]
	if len(pathBytes) == 0 {
		return DecodedRef{}, domain.BadRequest("Código de ROM inválido.")
	}

	var relPath string
	if (flags & flagCompressed) != 0 {
		inflated, err := decompressWithDict(pathBytes)
		if err != nil {
			return DecodedRef{}, domain.BadRequest("Código de ROM inválido.")
		}
		relPath = string(inflated)
	} else {
		relPath = string(pathBytes)
	}

	if (flags & flagHasPrefix) != 0 {
		relPath = spec.PathPrefix + relPath
	}
	if (flags & flagHasSuffix) != 0 {
		relPath += spec.PathSuffix
	}

	gameURL := "https://" + spec.Host + "/" + strings.TrimPrefix(relPath, "/")
	if !htmlutil.ValidateGameURL(gameURL, spec.Domain) {
		return DecodedRef{}, domain.BadRequest("Código de ROM contém URL inválida.")
	}

	return DecodedRef{
		Code:      trimmed,
		Source:    spec.Source,
		GameURL:   gameURL,
		FileIndex: fileIndex,
		HasFile:   hasFile,
		FileHash:  fileHash,
	}, nil
}

func compressWithDict(input []byte) ([]byte, error) {
	var buf bytes.Buffer
	w, err := flate.NewWriterDict(&buf, flate.BestCompression, presetDict)
	if err != nil {
		return nil, err
	}
	if _, err := w.Write(input); err != nil {
		return nil, err
	}
	if err := w.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func decompressWithDict(input []byte) ([]byte, error) {
	r := flate.NewReaderDict(bytes.NewReader(input), presetDict)
	defer r.Close()
	out, err := io.ReadAll(io.LimitReader(r, maxDecompressedSize+1))
	if err != nil || len(out) == 0 || len(out) > maxDecompressedSize {
		return nil, domain.BadRequest("Código de ROM inválido.")
	}
	return out, nil
}
