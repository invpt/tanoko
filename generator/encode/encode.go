package encode

import (
	"io"
	"unsafe"
)

type Stream struct {
	scratch *Buffer
	content io.Writer
}

func NewStream(w io.Writer) *Stream {
	return &Stream{content: w}
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
	_, err := s.content.Write(b.bytes)
	if err != nil {
		return err
	}
	_, err = s.content.Write(s.scratch.bytes)
	if err != nil {
		return err
	}
	s.scratch.Reset()
	return nil
}

type Buffer struct{ bytes []byte }

func NewBuffer() *Buffer {
	return &Buffer{bytes: []byte{}}
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

func Bool(b *Buffer, v bool) {
	if v {
		Uint(b, uint8(1))
	} else {
		Uint(b, uint8(0))
	}
}

func Int[T int | int8 | int16 | int32 | int64](b *Buffer, i T) {
	zigzag := i<<1 ^ i>>(sizeOf[T]()*8-1)
	b.varint(uint64(zigzag))
}

func Uint[T uint | uint8 | uint16 | uint32 | uint64](b *Buffer, i T) {
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
		newCtxBytes := make([]byte, len(b.bytes), n+len(b.bytes))
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
