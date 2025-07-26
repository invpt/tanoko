package encode

import (
	"io"
	"unsafe"
)

type Stream struct {
	scratch *Buffer
	content io.Writer
	offset  int
}

func NewStream(w io.Writer) *Stream {
	return &Stream{content: w}
}

func (s *Stream) Offset() int {
	return s.offset
}

func (s *Stream) Append() (*Buffer, error) {
	if s.scratch != nil {
		if err := s.flush(); err != nil {
			return nil, err
		}
	} else {
		s.scratch = NewBuffer()
	}

	return s.scratch, nil
}

func (s *Stream) Flush() error {
	if s.scratch != nil {
		return s.flush()
	}

	return nil
}

func (s *Stream) flush() error {
	var d [10]byte
	b := Buffer{bytes: d[:0]}
	b.varint(uint64(len(s.scratch.bytes)))
	n, err := s.content.Write(b.bytes)
	if err != nil {
		return err
	}
	s.offset += n
	n, err = s.content.Write(s.scratch.bytes)
	if err != nil {
		return err
	}
	s.offset += n
	s.scratch.Reset()
	return nil
}

type Buffer struct{ bytes []byte }

func NewBuffer() *Buffer {
	return &Buffer{bytes: []byte{}}
}

func (b *Buffer) Offset() int {
	return len(b.bytes)
}

func (b *Buffer) Reset() {
	b.bytes = b.bytes[:0]
}

// NOTE: do not reuse the buffer after calling Finish()
func (b Buffer) Finish() []byte {
	return b.bytes
}

func Array[T any](b *Buffer, items []T) []T {
	b.varint(uint64(len(items)))
	return items
}

func String(b *Buffer, s string) {
	b.varint(uint64(len(s)))
	copy(b.reserve(len(s)), s)
}

func Raw(b *Buffer, s string) {
	copy(b.reserve(len(s)), s)
}

func Bool(b *Buffer, v bool) {
	if v {
		Uint8(b, 1)
	} else {
		Uint8(b, 0)
	}
}

func Int8(b *Buffer, i int8) {
	fixed(b, i)
}

func Uint8(b *Buffer, i uint8) {
	fixed(b, i)
}

func Int16(b *Buffer, i int16) {
	fixed(b, i)
}

func Uint16(b *Buffer, i uint16) {
	fixed(b, i)
}

func Int32(b *Buffer, i int32) {
	fixed(b, i)
}

func Uint32(b *Buffer, i uint32) {
	fixed(b, i)
}

func Int64(b *Buffer, i int64) {
	fixed(b, i)
}

func Uint64(b *Buffer, i uint64) {
	fixed(b, i)
}

func fixed[T int | int8 | int16 | int32 | int64 | uint | uint8 | uint16 | uint32 | uint64](b *Buffer, i T) {
	size := int(sizeOf[T]())
	bytes := b.reserve(size)
	val := uint64(i)
	for j := 0; j < size; j++ {
		bytes[j] = byte(val)
		val >>= 8
	}
}

func Varint[T int | int8 | int16 | int32 | int64](b *Buffer, i T) {
	zigzag := i<<1 ^ i>>(sizeOf[T]()*8-1)
	b.varint(uint64(zigzag))
}

func Uvarint[T uint | uint8 | uint16 | uint32 | uint64](b *Buffer, i T) {
	b.varint(uint64(i))
}

func (b *Buffer) varint(i uint64) {
	for i > 0x7F {
		b.reserve(1)[0] = byte(i) | 0x80
		i >>= 7
	}
	b.reserve(1)[0] = byte(i)
}

func (b *Buffer) reserve(n int) (bytes []byte) {
	if n+len(b.bytes) > cap(b.bytes) {
		// we must allocate a bigger buffer.
		newCtxBytes := make([]byte, len(b.bytes), max(n+len(b.bytes), 2*len(b.bytes)))
		copy(newCtxBytes, b.bytes)
		b.bytes = newCtxBytes
	}

	bytes = b.bytes[len(b.bytes) : n+len(b.bytes)]
	b.bytes = b.bytes[:n+len(b.bytes)]

	return
}

func sizeOf[T any]() uintptr {
	var zero T
	return unsafe.Sizeof(zero)
}
