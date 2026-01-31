require_relative "spec_helper"

def check_dir_listing_content_type(content_type)
  content_type.must_match(%r{application\/(ld\+)?json})
  if content_type != "application/ld+json"
    puts "WARNING: the content type \"#{content_type}\" works for directory listings, but the correct one to use is \"application/ld+json\"".yellow
  end
end

describe "PUT with same name as existing directory" do
  it "returns a 409" do
    do_put_request("#{CONFIG[:category]}/some-subdir", '', {content_type: "text/plain"}) do |res|
      res.code.must_equal 409
    end
  end
end

describe "PUT with same directory name as existing object" do
  before do
    do_put_request("#{CONFIG[:category]}/my-list", '', {content_type: "text/plain"})
  end

  it "returns a 409" do
    do_put_request("#{CONFIG[:category]}/my-list/item", '', {content_type: "text/plain"}) do |res|
      res.code.must_equal 409
    end
  end
end

describe "PUT with Content-Range" do
  it "returns a 400" do
    # https://tools.ietf.org/html/rfc7231#section-4.3.4
    do_put_request("#{CONFIG[:category]}/some-subdir/nested-folder-object.json",
                   'sup', {content_range: "bytes 0-3/3", content_type: "text/plain"}) do |res|
      res.code.must_equal 400
    end
  end
end

describe "files" do
  
  describe "PUT a JPG image" do
    before do
      @res = do_put_request("#{CONFIG[:category]}/Capture d'écran.jpg",
             File.open("fixtures/files/capture.jpg"),
             { content_type: "image/jpeg; charset=binary" })
    end

    it "works" do
      [200, 201].must_include @res.code
      @res.headers[:etag].wont_be_nil
      @res.headers[:etag].must_be_etag
    end
  end

  describe "GET a JPG image" do
    before do
      @res = do_network_request("#{CONFIG[:category]}/Capture d'écran.jpg", method: :get, raw_response: true)
    end

    it "works" do
      @res.code.must_equal 200
      @res.headers[:etag].wont_be_nil
      @res.headers[:etag].must_be_etag
      @res.headers[:content_type].must_equal "image/jpeg; charset=binary"
      @res.headers[:content_length].must_equal "28990"
      @res.to_s.must_equal File.read("fixtures/files/capture.jpg")
    end
  end

end

describe "read-only token" do

  describe "GET" do
    it "works" do
      res = do_get_request("#{CONFIG[:category]}/test-object-simple.json",
                           authorization: "Bearer #{CONFIG[:read_only_token]}")

      res.code.must_equal 200
    end
  end

  describe "HEAD" do
    it "works" do
      res = do_head_request("#{CONFIG[:category]}/test-object-simple.json",
                            authorization: "Bearer #{CONFIG[:read_only_token]}")

      [200, 204].must_include res.code
      res.body.must_be_empty
    end
  end

  describe "PUT" do
    it "fails" do
      res = do_put_request("#{CONFIG[:category]}/test-object-simple-test.json",
                           '{"new": "object"}',
                           { content_type: "application/json",
                             authorization: "Bearer #{CONFIG[:read_only_token]}" })

      [401, 403].must_include res.code
    end
  end

  describe "DELETE" do
    it "fails" do
      res = do_delete_request("#{CONFIG[:category]}/test-object-simple.json",
                              authorization: "Bearer #{CONFIG[:read_only_token]}")

      [401, 403].must_include res.code
    end
  end

end

describe "using base URL of a different user" do

  it "should fail" do
    ["GET", "PUT", "DELETE"].each do |method|
      res = do_network_request("#{CONFIG[:category]}/failwhale.png",
                               method: method,
                               base_url: CONFIG[:storage_base_url_other])

      [401, 403].must_include res.code
    end
  end

end

describe "root directory" do

  describe "PUT a JSON object to root dir" do
    it "fails with normal token" do
      res = do_put_request("thisisbadpractice.json", '{"new": "object"}',
                            { content_type: "application/json" })

      [401, 403].must_include res.code
    end

    it "works with root token" do
      res = do_put_request("thisisbadpractice.json", '{"new": "object"}',
                            { content_type: "application/json",
                              authorization: "Bearer #{CONFIG[:root_token]}"})

      [200, 201].must_include res.code
      res.headers[:etag].wont_be_nil
      res.headers[:etag].must_be_etag
    end
  end

  describe "HEAD directory listing of root dir" do
    before do
      @res = do_head_request("", {authorization: "Bearer #{CONFIG[:root_token]}"})
    end

    it "works" do
      [200, 204].must_include @res.code
      @res.headers[:etag].must_be_etag
      check_dir_listing_content_type(@res.headers[:content_type])
      @res.body.must_equal ""
    end
  end

  describe "GET directory listing of root dir" do
    before do
      @res = do_get_request("", {authorization: "Bearer #{CONFIG[:root_token]}"})
      @listing = JSON.parse @res.body
    end

    it "works" do
      @res.code.must_equal 200
      @res.headers[:etag].must_be_etag
      check_dir_listing_content_type(@res.headers[:content_type])

      @listing["@context"].must_equal "http://remotestorage.io/spec/folder-description"
      @listing["items"].each_pair do |key, value|
        key.must_be_kind_of String
        value["ETag"].must_be_kind_of String
        if key[-1] == "/"
          value.keys.must_equal ["ETag"]
        else
          value["Content-Length"].must_be_kind_of Integer
          value["Content-Type"].must_be_kind_of String
        end
      end
    end

    it "contains the correct items" do
      @listing["items"].keys.must_include "#{CONFIG[:category]}/"
      @listing["items"].keys.must_include "thisisbadpractice.json"
      @listing["items"].count.must_equal 2
    end
  end

  describe "DELETE object in root dir" do
    it "works" do
      res = do_delete_request("thisisbadpractice.json",
                              {authorization: "Bearer #{CONFIG[:root_token]}"})

      res.code.must_equal 200
      do_head_request("thisisbadpractice.json", {authorization: "Bearer #{CONFIG[:root_token]}"}) do |response|
        response.code.must_equal 404
      end
    end
  end

end

describe "GET a JSON object while accepting compressed content" do
  before do
    @res = do_get_request("#{CONFIG[:category]}/test-object-simple.json",
                          { accept_encoding: 'gzip, deflate, br' })
  end

  it "works" do
    @res.code.must_equal 200
    @res.headers[:content_encoding].must_be_nil
    @res.headers[:etag].wont_be_nil
    @res.headers[:etag].must_be_etag
    @res.headers[:content_type].must_equal "application/json"
    @res.headers[:content_length].must_equal "102"
    @res.headers[:cache_control].must_equal "no-cache"
    @res.body.must_equal '{"new": "object", "should_be": "large_enough", "to_trigger": "compression", "if_enabled": "on_server"}'
  end
end

describe "public" do

  describe "PUT with a read/write category token" do
    it "works" do
      res = do_put_request("public/#{CONFIG[:category]}/test-object-simple.json",
                           '{"new": "object"}',
                           { content_type: "application/json" })

      [200, 201].must_include res.code
    end
  end

  describe "PUT with a read/write category token to wrong category" do
    it "fails" do
      res = do_put_request("public/othercategory/test-object-simple.json",
                           '{"new": "object"}',
                           { content_type: "application/json" })

      [401, 403].must_include res.code
    end
  end

  describe "GET without a token" do
    it "works" do
      res = do_get_request("public/#{CONFIG[:category]}/test-object-simple.json",
                           authorization: nil)

      res.code.must_equal 200
    end
  end

  describe "HEAD without a token" do
    it "works" do
      res = do_head_request("public/#{CONFIG[:category]}/test-object-simple.json",
                            authorization: nil)

      [200, 204].must_include res.code
      res.body.must_be_empty
    end
  end

  describe "PUT without a token" do
    it "is not allowed" do
      res = do_put_request("public/#{CONFIG[:category]}/test-object-simple-test.json",
                           '{"new": "object"}',
                           { content_type: "application/json",
                             authorization: nil })

      [401, 403].must_include res.code
    end
  end

  describe "GET directory listing without a token" do
    it "is not allowed" do
      res = do_get_request("public/#{CONFIG[:category]}/", authorization: nil)

      [401, 403].must_include res.code
    end

    it "doesn't expose if folder is empty" do
      res = do_get_request("public/#{CONFIG[:category]}/", authorization: nil)
      res2 = do_get_request("public/#{CONFIG[:category]}/foo/", authorization: nil)

      res.code.must_equal res2.code
      res.headers.must_equal res2.headers
      res.body.must_equal res2.body
    end
  end

  describe "GET directory listing with a read-write category token" do
    it "works" do
      res = do_get_request("public/#{CONFIG[:category]}/")

      res.code.must_equal 200
    end
  end

  describe "DELETE without a token" do
    it "is not allowed" do
      res = do_delete_request("public/#{CONFIG[:category]}/test-object-simple.json",
                              authorization: nil)

      [401, 403].must_include res.code
    end
  end

  describe "DELETE with a read/write category token" do
    it "works" do
      res = do_delete_request("public/#{CONFIG[:category]}/test-object-simple.json")

      [200, 204].must_include res.code
    end
  end

end
